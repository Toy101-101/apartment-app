import {
  compact, db, newId, now,
  type Deduction, type Lease, type MoveOut, type Room, type Tenant,
} from '../db'
import { daysUntil, today } from './date'

/**
 * 退去の立会いと敷金の精算
 *
 * 目的は2つ。
 *
 * 1. **やることの抜けを防ぐ**。退去は年に1〜2回しか起きないので、手順を覚えていられない。
 *    鍵の本数を数えそこねる、写真を撮り忘れる、といったことが後で効いてくる
 * 2. **敷金からいくら・なぜ引いたかを残す**。敷金で揉めるのは金額そのものではなく、
 *    「なぜ引かれたのか分からない」とき。理由を書いて渡せば、たいていは揉めない
 *
 * 決めごと
 * - 差し引きから**③修繕・費用の記録は自動で作らない**。
 *   業者に払った額（出ていったお金）と、敷金から引いた額（返さないお金）は別のもの。
 *   自動で作ると、年ごとのまとめで二重に数えてしまう。画面でその旨を案内する
 * - 返す額は**マイナスにしない**。敷金で足りないぶんは「足りない額」として別に出す
 *   （返す額が「−3万円」では、返すのか請求するのか読み取れない）
 * - ホームで知らせるのは**退去から180日まで**。それ以前の古い契約が
 *   いつまでも「手続きが終わっていません」と出続けると、知らせ全体が読み飛ばされる
 */

/** やることの手順。増やすときはここに足す（key は控えに残るので、消したり変えたりしない） */
export const STEPS: { key: string; label: string; hint?: string }[] = [
  { key: 'appointment', label: '立会いの日を決めた' },
  { key: 'inspected', label: '立会いをした（部屋の状態を見た）' },
  {
    key: 'photos', label: '写真を撮った',
    hint: 'あとで「そんな傷はなかった」と言われないため。③修繕・費用に付けておけます',
  },
  { key: 'keys', label: '鍵を返してもらった', hint: '本数を数える。合鍵があれば、それも' },
  { key: 'utilities', label: '電気・ガス・水道が止まったか確かめた' },
  {
    key: 'settled', label: '敷金の精算を伝えた',
    hint: '引く額と、その理由を書いたものを渡す。ここを省くと揉めます',
  },
  { key: 'refunded', label: '敷金を返した' },
]

/** ホームで知らせ続ける日数 */
export const NOTICE_DAYS = 180

// --- 計算だけ -------------------------------------------------------------

const alive = <T extends { deletedAt?: string }>(row: T) => !row.deletedAt

export interface Settlement {
  deposit: number
  /** 差し引きの合計 */
  deducted: number
  /** 返す額（0未満にはしない） */
  refund: number
  /** 敷金で足りないぶん（追加で請求する額）。足りていれば0 */
  shortfall: number
}

export function settle(deposit: number, deductions: Deduction[]): Settlement {
  const deducted = deductions.reduce((sum, d) => sum + d.amount, 0)
  const left = deposit - deducted
  return {
    deposit,
    deducted,
    refund: Math.max(left, 0),
    shortfall: Math.max(-left, 0),
  }
}

export interface Step {
  key: string
  label: string
  hint?: string
  done: boolean
}

export function buildSteps(moveOut: MoveOut | undefined): Step[] {
  const done = new Set(moveOut?.done ?? [])
  return STEPS.map((step) => ({ ...step, done: done.has(step.key) }))
}

/** まだ済んでいない手順の数 */
export function remainingCount(moveOut: MoveOut | undefined): number {
  return buildSteps(moveOut).filter((s) => !s.done).length
}

export interface PendingMoveOut {
  lease: Lease
  room?: Room
  tenant?: Tenant
  moveOut?: MoveOut
  /** 残っている手順の数 */
  remaining: number
  /** 退去してから何日たったか */
  daysSince: number
}

/**
 * まだ手続きが終わっていない退去（ホームに出すぶん）。
 * 退去から180日を過ぎたものは出さない（→ このファイル冒頭の決めごと）。
 */
export function pendingMoveOuts({
  leases, rooms, tenants, moveOuts, from = today(),
}: {
  leases: Lease[]
  rooms: Room[]
  tenants: Tenant[]
  moveOuts: MoveOut[]
  from?: string
}): PendingMoveOut[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const byLease = new Map(moveOuts.filter(alive).map((m) => [m.leaseId, m]))

  return leases
    .filter(alive)
    .filter((l) => l.movedOutOn && l.movedOutOn <= from)
    .map((lease) => {
      const moveOut = byLease.get(lease.id)
      return {
        lease,
        room: roomById.get(lease.roomId),
        tenant: tenantById.get(lease.tenantId),
        moveOut,
        remaining: remainingCount(moveOut),
        daysSince: -daysUntil(lease.movedOutOn!, from),
      }
    })
    .filter((r) => r.remaining > 0 && r.daysSince <= NOTICE_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)
}

// --- データベースの読み書き -----------------------------------------------

export async function readMoveOut(leaseId: string): Promise<MoveOut | undefined> {
  const row = await db.moveOuts.where('leaseId').equals(leaseId).first()
  return row && alive(row) ? row : undefined
}

/** 無ければ作る。手順を1つ押した瞬間に作られるので、退去にしただけでは行が増えない */
async function ensure(leaseId: string): Promise<MoveOut> {
  const found = await readMoveOut(leaseId)
  if (found) return found
  const at = now()
  const row: MoveOut = {
    id: newId(), createdAt: at, updatedAt: at,
    leaseId, done: [], deductions: [],
  }
  await db.moveOuts.put(row)
  return row
}

/** 手順の済／未を切り替える */
export async function toggleStep(leaseId: string, key: string): Promise<void> {
  const row = await ensure(leaseId)
  const done = row.done.includes(key)
    ? row.done.filter((k) => k !== key)
    : [...row.done, key]

  const next: MoveOut = { ...row, done, updatedAt: now() }
  // 「敷金を返した」を押した日を、返した日として残す
  if (key === 'refunded') {
    if (done.includes(key)) next.refundedOn = today()
    else delete next.refundedOn
  }
  await db.moveOuts.put(next)
}

export async function addDeduction(
  leaseId: string, input: { title: string; amount: number; reason: string },
): Promise<string> {
  const row = await ensure(leaseId)
  const id = newId()
  await db.moveOuts.put({
    ...row,
    updatedAt: now(),
    deductions: [...row.deductions, {
      id,
      title: input.title.trim(),
      amount: input.amount,
      reason: input.reason.trim(),
    }],
  })
  return id
}

export async function removeDeduction(leaseId: string, deductionId: string): Promise<void> {
  const row = await readMoveOut(leaseId)
  if (!row) return
  await db.moveOuts.put({
    ...row,
    updatedAt: now(),
    deductions: row.deductions.filter((d) => d.id !== deductionId),
  })
}

export async function setMoveOutMemo(leaseId: string, memo: string): Promise<void> {
  const row = await ensure(leaseId)
  await db.moveOuts.put(compact({ ...row, updatedAt: now(), memo: memo.trim() || undefined }))
}

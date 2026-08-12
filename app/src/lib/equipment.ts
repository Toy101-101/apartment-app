import {
  compact, db, newId, now, type Equipment, type EquipmentKind, type Room,
} from '../db'
import { monthOf } from './rent'
import { today } from './date'
import { createExpense } from './expenses'

/**
 * ⑥ 設備の年式（給湯器・エアコンなど）
 *
 * 壊れてから慌てて手配すると、真冬や真夏に入居者を待たせたうえ、
 * 緊急の工事になって高くつく。設置した年を残しておけば「そろそろ替え時」が先に分かり、
 * 退去して部屋が空いているあいだに落ち着いて替えられる。
 *
 * 決めごと
 * - 設置は**年月まで**（'YYYY-MM'）。日まで覚えていることは、まず無い
 * - 何年もつかは**目安**。種類ごとに既定値を入れておくが、**あとから直せる**ようにする。
 *   使い方や機種で変わるうえ、断定できる数字ではないため
 * - 取り替えたら**上書きしない**。古い行に `replacedOn` を入れて残し、新しい行を作る。
 *   「前のは13年もった」という記録が、次に替えるときの判断材料になる
 */

export const KIND_LABEL: Record<EquipmentKind, string> = {
  waterHeater: '給湯器',
  aircon: 'エアコン',
  other: 'その他',
}

/**
 * 何年もつかの目安（年）。
 * 断定できる数字ではないので、あくまで初期値として置き、画面から直せるようにしてある。
 */
export const DEFAULT_LIFE_YEARS: Record<EquipmentKind, number> = {
  waterHeater: 12,
  aircon: 13,
  other: 10,
}

/**
 * 一覧・履歴・③修繕への記録で使う呼び名。
 *
 * 名前が入っていればそれを、無ければ種類の名前を出す。
 * 「その他」が受水槽とポンプの2つあると、種類の名前だけでは見分けられないため。
 *
 * **出す場所ごとに書き分けないこと。** ここを通しておけば、
 * 一覧で「受水槽」と呼んでいるものが、③の記録では「その他の取り替え」になる、
 * といった食いちがいが起きない。
 */
export function labelOf(e: { kind: EquipmentKind; name?: string }): string {
  return e.name?.trim() || KIND_LABEL[e.kind]
}

// --- 計算だけ -------------------------------------------------------------

const alive = <T extends { deletedAt?: string }>(row: T) => !row.deletedAt

/** 設置からの月数 */
export function ageInMonths(installedOn: string, on: string = today()): number {
  const [y1, m1] = installedOn.split('-').map(Number)
  const [y2, m2] = on.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/** '13年2か月' / '8か月' / '今月' */
export function ageText(months: number): string {
  if (months < 0) return 'これから'
  // 取り替えた直後は必ずここを通る。「0か月」は数字に見えて読みにくい
  if (months === 0) return '今月'
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest}か月`
  return rest === 0 ? `${years}年` : `${years}年${rest}か月`
}

/** 替え時の近さ。過ぎていれば赤、残り2年ほどになったら黄 */
export type LifeLevel = 'red' | 'yellow' | 'none'

export function levelOf(months: number, lifeYears: number): LifeLevel {
  const lifeMonths = lifeYears * 12
  if (months >= lifeMonths) return 'red'
  if (months >= lifeMonths - 24) return 'yellow'
  return 'none'
}

export function lifeText(months: number, lifeYears: number): string {
  const left = lifeYears * 12 - months
  if (left <= 0) return `目安の${lifeYears}年を過ぎています`
  if (left < 12) return `あと${left}か月ほどで替え時`
  return `あと${Math.floor(left / 12)}年ほどで替え時`
}

export interface EquipmentRow {
  equipment: Equipment
  room?: Room
  /** '103号室' か '建物全体' */
  target: string
  /** '給湯器' か、名前を入れてあれば '受水槽' */
  label: string
  months: number
  ageText: string
  level: LifeLevel
  lifeText: string
}

export function buildEquipmentRows({
  equipment, rooms, on = today(),
}: {
  equipment: Equipment[]
  rooms: Room[]
  on?: string
}): EquipmentRow[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return equipment
    // 取り替えたものは一覧に出さない（履歴としては行が残っている）
    .filter((e) => alive(e) && !e.replacedOn)
    .map((e) => {
      const room = e.roomId ? roomById.get(e.roomId) : undefined
      const months = ageInMonths(e.installedOn, on)
      return {
        equipment: e,
        room,
        target: room ? `${room.roomNo}号室` : '建物全体',
        label: labelOf(e),
        months,
        ageText: ageText(months),
        level: levelOf(months, e.lifeYears),
        lifeText: lifeText(months, e.lifeYears),
      }
    })
    // 古いものが先。替え時が近い順になる
    .sort((a, b) => b.months - a.months)
}

/** 替え時が来ている・近いもの */
export function needsAttention(rows: EquipmentRow[]): EquipmentRow[] {
  return rows.filter((r) => r.level !== 'none')
}

/** 替え時を過ぎているものだけ（ホームで色を変える判断に使う） */
export function overdue(rows: EquipmentRow[]): EquipmentRow[] {
  return rows.filter((r) => r.level === 'red')
}

/** 取り替えた履歴（新しい順）。「前のは何年もったか」を見るため */
export function replacedHistory(equipment: Equipment[]): Equipment[] {
  return equipment
    .filter((e) => alive(e) && e.replacedOn)
    .sort((a, b) => (b.replacedOn ?? '').localeCompare(a.replacedOn ?? ''))
}

// --- データベースの読み書き -----------------------------------------------

export interface EquipmentInput {
  kind: EquipmentKind
  name?: string
  roomId?: string
  installedOn: string
  lifeYears: number
  maker?: string
  model?: string
  memo?: string
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

function fieldsOf(input: EquipmentInput) {
  return {
    kind: input.kind,
    name: trimmed(input.name),
    roomId: trimmed(input.roomId),
    installedOn: input.installedOn,
    lifeYears: input.lifeYears,
    maker: trimmed(input.maker),
    model: trimmed(input.model),
    memo: trimmed(input.memo),
  }
}

export async function createEquipment(input: EquipmentInput): Promise<string> {
  const at = now()
  const id = newId()
  await db.equipment.put(compact({ id, createdAt: at, updatedAt: at, ...fieldsOf(input) }))
  return id
}

export async function updateEquipment(id: string, input: EquipmentInput): Promise<void> {
  const before = await db.equipment.get(id)
  if (!before) throw new Error('その設備が見つかりませんでした。')
  await db.equipment.put(compact({ ...before, updatedAt: now(), ...fieldsOf(input) }))
}

/** 消す（行は残し、消した印をつけるだけ） */
export async function removeEquipment(id: string): Promise<void> {
  const before = await db.equipment.get(id)
  if (!before) return
  const at = now()
  await db.equipment.put({ ...before, deletedAt: at, updatedAt: at })
}

export interface ReplaceResult {
  /** 新しく作った設備の id */
  newId: string
  /** ③修繕・費用に作った記録の id。金額を入れなかったときは入らない */
  expenseId?: string
  /** 前のものが何年もったか */
  lastedText: string
}

/**
 * 取り替える。
 *
 * 古い行は消さずに `replacedOn` を入れて残し、新しい行を作る。
 * 「前のは13年もった」という記録が、次に替えるときの判断材料になる。
 * 金額を入れたときだけ、③修繕・費用に修繕として1件残す。
 *
 * `lifeYears` は、入れなければ前のものと同じにする。
 * 「前のが8年で壊れたから、次は長めに見ておく」と画面で直したときに、
 * その数字が黙って捨てられないよう、受け取れるようにしてある。
 *
 * **名前も、入れなければ前のものから引き継ぐ。**
 * メーカーや型番は「その1台のもの」なので新しく入れ直すが、名前は
 * 「それが何であるか」（受水槽・ポンプ）なので、中身を替えても変わらない。
 * ここを引き継がないと、受水槽を替えたとたんに一覧が「その他」に戻り、
 * どれがどれだか分からなくなる。
 */
export async function replaceEquipment(
  id: string,
  done: {
    date: string
    amount?: number
    lifeYears?: number
    name?: string
    maker?: string
    model?: string
    memo?: string
  },
): Promise<ReplaceResult> {
  const before = await db.equipment.get(id)
  if (!before) throw new Error('その設備が見つかりませんでした。')

  const at = now()
  const lasted = ageInMonths(before.installedOn, done.date)
  const created = newId()

  await db.transaction('rw', [db.equipment], async () => {
    await db.equipment.put({ ...before, replacedOn: done.date, updatedAt: at })
    await db.equipment.put(compact({
      id: created, createdAt: at, updatedAt: at,
      kind: before.kind,
      name: trimmed(done.name) ?? before.name,
      roomId: before.roomId,
      installedOn: monthOf(done.date),
      lifeYears: done.lifeYears && done.lifeYears > 0 ? done.lifeYears : before.lifeYears,
      maker: trimmed(done.maker),
      model: trimmed(done.model),
      memo: trimmed(done.memo),
    }))
  })

  const result: ReplaceResult = { newId: created, lastedText: ageText(lasted) }

  if (done.amount !== undefined && done.amount > 0) {
    result.expenseId = await createExpense({
      kind: 'repair',
      date: done.date,
      // 一覧で「受水槽」と呼んでいるものが、③では「その他の取り替え」になると追えない
      title: `${labelOf(before)}の取り替え`,
      amount: done.amount,
      roomId: before.roomId,
      photoIds: [],
      memo: `前のものは${ageText(lasted)}もった（${before.installedOn}に設置）`,
    })
  }

  return result
}

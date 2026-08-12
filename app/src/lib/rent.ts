import type { Lease, Payment, RentTerm, Room, Tenant } from '../db'
import { daysUntil, monthKey } from './date'

/**
 * 家賃の計算
 *
 * データベースには触らない、計算だけの置き場。だから試験しやすい。
 * 画面（Payments.tsx）は、ここで組み立てた行をそのまま並べるだけにする。
 */

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

/** 今月 'YYYY-MM' */
export function thisMonth(now: Date = new Date()): string {
  return monthKey(now)
}

const alive = <T extends { deletedAt?: string }>(row: T) => !row.deletedAt

/**
 * その月に効いている家賃を選ぶ。
 * 「2022年の更新で2,000円下げた」を残すため、家賃は上書きせず行を足していく。
 * だから「適用開始年月がその月以前のもののうち、いちばん新しいもの」が答えになる。
 */
export function rentTermFor(terms: RentTerm[], month: string): RentTerm | undefined {
  return terms
    .filter((t) => alive(t) && t.fromMonth <= month)
    .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))[0]
}

/** 毎月いただく額（家賃＋管理費） */
export function dueOf(term: RentTerm | undefined): number {
  return term ? term.rent + term.mgmtFee : 0
}

/**
 * その月に契約が生きているか。
 * 退去した日が入っていれば、契約の終わりの日より前でもそこまで。
 */
export function isActiveIn(lease: Lease, month: string): boolean {
  if (!alive(lease)) return false
  const end = monthOf(lease.movedOutOn ?? lease.endDate)
  return monthOf(lease.startDate) <= month && month <= end
}

/**
 * その日に契約が生きているか（日にちまで見る）。
 *
 * 空室の判定には、月ではなく日で見なければならない。
 * 8月5日に退去した部屋を、8月11日に「まだ入居中」と出してしまうため。
 */
export function isActiveOn(lease: Lease, day: string): boolean {
  if (!alive(lease)) return false
  return lease.startDate <= day && day <= (lease.movedOutOn ?? lease.endDate)
}

/**
 * 契約更新の近さ。
 *
 * 「いつから知らせるか」は設定で変えられる（既定は60日前）。
 * そのうち**残り1か月を切ったら赤**にする。ここは急ぐ側なので固定でよい。
 * ただし知らせ始める日数のほうが短いときは、そちらに合わせる
 * （「30日前から」と決めたのに35日前から赤くなるのでは、設定した意味がない）。
 */
export type RenewalLevel = 'red' | 'yellow' | 'none'

/** 残りこれを切ったら赤（設定の日数のほうが短ければ、そちらを使う） */
export const URGENT_DAYS = 30

/**
 * 知らせ始める日数の既定（v1からの動き。設定を触らなければ、これまでと同じ）。
 *
 * 置き場をここにしてあるのは、`settings.ts` が `db` を読むため。
 * この `rent.ts` は計算だけで DB に触らない決まりなので、逆に取り込むことはできない。
 * 設定の側（`settings.ts`）が、ここから受け取って使い回す。
 * **60 という数字を、これ以外の場所に書かないこと。**
 */
export const DEFAULT_RENEWAL_NOTICE_DAYS = 60

export function renewalLevel(
  endDate: string, from?: string, noticeDays = DEFAULT_RENEWAL_NOTICE_DAYS,
): { level: RenewalLevel; days: number } {
  const days = daysUntil(endDate, from)
  if (days <= Math.min(URGENT_DAYS, noticeDays)) return { level: 'red', days }
  if (days <= noticeDays) return { level: 'yellow', days }
  return { level: 'none', days }
}

/** 入金の一覧に並べる1行ぶん */
export interface MonthRow {
  room: Room
  /** その月に契約がなければ空室 */
  lease?: Lease
  tenant?: Tenant
  /** その月にいただく額（家賃＋管理費） */
  due: number
  payment?: Payment
  /** 済か未か。空室の行は常に false（数にも入れない） */
  paid: boolean
}

export interface MonthInput {
  month: string
  rooms: Room[]
  leases: Lease[]
  tenants: Tenant[]
  rentTerms: RentTerm[]
  payments: Payment[]
}

/** 部屋ごとに1行、その月の状態を組み立てる（部屋の並び順のまま） */
export function buildMonthRows({
  month, rooms, leases, tenants, rentTerms, payments,
}: MonthInput): MonthRow[] {
  const tenantById = new Map(tenants.map((t) => [t.id, t]))

  return rooms
    .filter(alive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((room) => {
      const lease = leases.find((l) => l.roomId === room.id && isActiveIn(l, month))
      if (!lease) return { room, due: 0, paid: false }

      const term = rentTermFor(rentTerms.filter((t) => t.leaseId === lease.id), month)
      const payment = payments.find((p) => alive(p) && p.leaseId === lease.id && p.month === month)
      return {
        room,
        lease,
        tenant: tenantById.get(lease.tenantId),
        due: dueOf(term),
        payment,
        paid: !!payment?.paidOn,
      }
    })
}

export interface MonthSummary {
  /** 実際に入ったお金の合計 */
  received: number
  /** 入るはずの合計 */
  expected: number
  /** まだの部屋 */
  unpaid: MonthRow[]
  /** 入居している部屋の数 */
  occupied: number
}

export function summarize(rows: MonthRow[]): MonthSummary {
  const living = rows.filter((r) => r.lease)
  return {
    // 受け取った額は、家賃と違うことがある（一部だけ入った等）。実際の額を足す
    received: living.filter((r) => r.paid).reduce((sum, r) => sum + (r.payment?.amount ?? r.due), 0),
    expected: living.reduce((sum, r) => sum + r.due, 0),
    unpaid: living.filter((r) => !r.paid),
    occupied: living.length,
  }
}

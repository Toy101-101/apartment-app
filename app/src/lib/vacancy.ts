import type { Lease, Room, Tenant } from '../db'
import { addDays, today } from './date'
import { isActiveOn } from './rent'

/**
 * ④ 空室の状況
 *
 * **契約データから毎回そのつど導き出す。** `status` のような欄は作らない。
 * 作った瞬間から、契約を直すたびに書きかえる手間が増え、いつか食い違う。
 * 二重管理をなくすことが、この画面のいちばんの目的。
 */

export type RoomState = 'occupied' | 'leaving' | 'vacant'

export const STATE_LABEL: Record<RoomState, string> = {
  occupied: '入居中',
  leaving: '退去予定',
  vacant: '空室',
}

export interface VacancyRow {
  room: Room
  state: RoomState
  /** 入居中・退去予定なら、いまの契約 */
  lease?: Lease
  tenant?: Tenant
  /** 退去予定なら、その日 */
  leavingOn?: string
  /** 空室なら、いつから空いているか（前の契約が終わった翌日） */
  vacantSince?: string
  /** 空室でも、次に入る契約が決まっていればその日 */
  nextFrom?: string
  /** 空室のとき、前に住んでいた方の契約（記録をたどれるように） */
  previousLease?: Lease
  previousTenant?: Tenant
}

export interface VacancyInput {
  rooms: Room[]
  leases: Lease[]
  tenants: Tenant[]
  /** 'YYYY-MM-DD'。省略すると今日 */
  from?: string
}

export function buildVacancyRows({
  rooms, leases, tenants, from = today(),
}: VacancyInput): VacancyRow[] {
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const living = leases.filter((l) => !l.deletedAt)

  return rooms
    .filter((r) => !r.deletedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((room): VacancyRow => {
      const mine = living.filter((l) => l.roomId === room.id)
      const current = mine.find((l) => isActiveOn(l, from))

      if (current) {
        return {
          room,
          // 退去日が入っていれば、まだ住んでいても「退去予定」
          state: current.movedOutOn ? 'leaving' : 'occupied',
          lease: current,
          tenant: tenantById.get(current.tenantId),
          leavingOn: current.movedOutOn,
        }
      }

      // 空室。前に住んでいた方（いちばん最近終わった契約）から、いつから空いているかを出す
      const past = mine
        .filter((l) => (l.movedOutOn ?? l.endDate) < from)
        .sort((a, b) => (b.movedOutOn ?? b.endDate).localeCompare(a.movedOutOn ?? a.endDate))[0]

      // 次に入る契約が決まっていれば、その日から
      const next = mine
        .filter((l) => l.startDate > from)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

      return {
        room,
        state: 'vacant',
        vacantSince: past ? addDays(past.movedOutOn ?? past.endDate, 1) : undefined,
        nextFrom: next?.startDate,
        previousLease: past,
        previousTenant: past ? tenantById.get(past.tenantId) : undefined,
      }
    })
}

/** 何室ずつあるか（画面のいちばん上に出す） */
export function countStates(rows: VacancyRow[]): Record<RoomState, number> {
  return {
    occupied: rows.filter((r) => r.state === 'occupied').length,
    leaving: rows.filter((r) => r.state === 'leaving').length,
    vacant: rows.filter((r) => r.state === 'vacant').length,
  }
}

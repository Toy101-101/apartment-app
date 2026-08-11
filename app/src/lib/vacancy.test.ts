import { describe, it, expect } from 'vitest'
import type { Lease, Room, Tenant } from '../db'
import { buildVacancyRows, countStates, STATE_LABEL } from './vacancy'

/**
 * ④ 空室の状況の試験
 *
 * この画面は独立した入力を持たない。契約から導き出すだけ。
 * だから確かめるのは「契約をこう置いたとき、部屋がどう見えるか」だけでよい。
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }
const TODAY = '2026-08-11'

const room = (no: string): Room =>
  ({ id: `r-${no}`, ...base, roomNo: no, floor: Number(no[0]), sortOrder: Number(no) })

const lease = (id: string, no: string, startDate: string, endDate: string, extra: Partial<Lease> = {}): Lease =>
  ({ id, ...base, roomId: `r-${no}`, tenantId: `t-${id}`, startDate, endDate, deposit: 0, keyMoney: 0, ...extra })

const tenant = (id: string, name: string): Tenant =>
  ({ id: `t-${id}`, ...base, name, kana: name })

const rooms = [room('102'), room('101'), room('103')] // わざと順番を崩して渡す

function build(leases: Lease[], tenants: Tenant[] = [], from = TODAY) {
  return buildVacancyRows({ rooms, leases, tenants, from })
}

describe('部屋の並び', () => {
  it('部屋番号の順に並ぶ', () => {
    expect(build([]).map((r) => r.room.roomNo)).toStrictEqual(['101', '102', '103'])
  })

  it('契約が1件も無ければ、全部が空室', () => {
    const rows = build([])
    expect(rows.every((r) => r.state === 'vacant')).toBe(true)
    expect(countStates(rows)).toStrictEqual({ occupied: 0, leaving: 0, vacant: 3 })
  })
})

describe('入居中', () => {
  it('その日に生きている契約があれば入居中', () => {
    const rows = build([lease('a', '101', '2024-04-01', '2027-03-31')], [tenant('a', '田中 一郎')])
    expect(rows[0].state).toBe('occupied')
    expect(rows[0].tenant?.name).toBe('田中 一郎')
  })

  it('契約が始まる前の日は、まだ空室', () => {
    const rows = build([lease('a', '101', '2026-09-01', '2028-08-31')])
    expect(rows[0].state).toBe('vacant')
    expect(rows[0].nextFrom).toBe('2026-09-01')
  })

  it('契約が終わった翌日から空室になる', () => {
    const l = [lease('a', '101', '2024-04-01', '2026-08-10')]
    expect(build(l, [], '2026-08-10')[0].state).toBe('occupied')
    expect(build(l, [], '2026-08-11')[0].state).toBe('vacant')
  })

  it('月の途中で退去した部屋を、まだ入居中と出さない', () => {
    // 月だけで見ていると「8月」どうしで一致してしまい、8月5日の退去を取りこぼす
    const l = [lease('a', '101', '2024-04-01', '2027-03-31', { movedOutOn: '2026-08-05' })]
    expect(build(l, [], '2026-08-11')[0].state).toBe('vacant')
    expect(build(l, [], '2026-08-05')[0].state).toBe('leaving')
  })
})

describe('退去予定', () => {
  const l = [lease('a', '101', '2024-04-01', '2027-03-31', { movedOutOn: '2026-09-30' })]

  it('退去日が入っていれば、まだ住んでいても退去予定', () => {
    const rows = build(l)
    expect(rows[0].state).toBe('leaving')
    expect(rows[0].leavingOn).toBe('2026-09-30')
  })

  it('その日を過ぎたら空室になる', () => {
    expect(build(l, [], '2026-10-01')[0].state).toBe('vacant')
    expect(build(l, [], '2026-10-01')[0].vacantSince).toBe('2026-10-01')
  })
})

describe('空室', () => {
  it('いつから空いているかは、前の契約の終わりの翌日', () => {
    const rows = build([lease('a', '101', '2020-01-01', '2026-06-30')])
    expect(rows[0].state).toBe('vacant')
    expect(rows[0].vacantSince).toBe('2026-07-01')
  })

  it('退去日があれば、そちらの翌日から数える', () => {
    const rows = build([lease('a', '101', '2020-01-01', '2026-12-31', { movedOutOn: '2026-06-15' })])
    expect(rows[0].vacantSince).toBe('2026-06-16')
  })

  it('前に住んでいた方をたどれる（記録は消さないから）', () => {
    const rows = build([lease('a', '101', '2020-01-01', '2026-06-30')], [tenant('a', '前の入居者')])
    expect(rows[0].previousTenant?.name).toBe('前の入居者')
    expect(rows[0].previousLease?.id).toBe('a')
  })

  it('何度か入れかわっていたら、いちばん最近の方をたどる', () => {
    const rows = build(
      [
        lease('old', '101', '2015-01-01', '2019-12-31'),
        lease('recent', '101', '2020-01-01', '2026-06-30'),
      ],
      [tenant('old', '昔の方'), tenant('recent', '直前の方')],
    )
    expect(rows[0].previousTenant?.name).toBe('直前の方')
    expect(rows[0].vacantSince).toBe('2026-07-01')
  })

  it('一度も入居が無ければ、いつからかは分からないままにする', () => {
    expect(build([])[0].vacantSince).toBeUndefined()
  })

  it('次に入る方が決まっていれば、その日が出る', () => {
    const rows = build([
      lease('a', '101', '2020-01-01', '2026-06-30'),
      lease('b', '101', '2026-11-01', '2028-10-31'),
    ])
    expect(rows[0].state).toBe('vacant')
    expect(rows[0].vacantSince).toBe('2026-07-01')
    expect(rows[0].nextFrom).toBe('2026-11-01')
  })
})

describe('契約を更新した部屋', () => {
  it('更新しても、切れ目なく入居中のまま（空室にならない）', () => {
    const leases = [
      lease('now', '101', '2024-04-01', '2026-08-31'),
      lease('next', '101', '2026-09-01', '2028-08-31'),
    ]
    expect(build(leases, [], '2026-08-31')[0].state).toBe('occupied')
    expect(build(leases, [], '2026-09-01')[0].state).toBe('occupied')
    expect(build(leases, [], '2026-09-01')[0].lease?.id).toBe('next')
  })
})

describe('数えかた', () => {
  it('入居中・退去予定・空室をそれぞれ数える', () => {
    const rows = build([
      lease('a', '101', '2024-04-01', '2027-03-31'),
      lease('b', '102', '2024-04-01', '2027-03-31', { movedOutOn: '2026-09-30' }),
    ])
    expect(countStates(rows)).toStrictEqual({ occupied: 1, leaving: 1, vacant: 1 })
  })

  it('画面には日本語で出す', () => {
    expect(STATE_LABEL.occupied).toBe('入居中')
    expect(STATE_LABEL.leaving).toBe('退去予定')
    expect(STATE_LABEL.vacant).toBe('空室')
  })
})

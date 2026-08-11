import { describe, it, expect } from 'vitest'
import type { Lease, Payment, RentTerm, Room, Tenant } from '../db'
import {
  buildMonthRows, dueOf, isActiveIn, monthOf, renewalLevel, rentTermFor, summarize,
} from './rent'

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const room = (id: string, roomNo: string, sortOrder: number): Room =>
  ({ id, ...base, roomNo, floor: Number(roomNo[0]), sortOrder })

const term = (id: string, leaseId: string, fromMonth: string, rent: number): RentTerm =>
  ({ id, ...base, leaseId, fromMonth, rent, mgmtFee: 3000 })

describe('その月に効いている家賃', () => {
  const terms = [
    term('t1', 'L', '2018-04', 57000),
    term('t2', 'L', '2022-04', 55000), // 更新のとき2,000円下げた
  ]

  it('いちばん新しい「適用開始年月」のものを選ぶ', () => {
    expect(rentTermFor(terms, '2026-08')?.rent).toBe(55000)
  })

  it('過去の月をひらけば、当時の家賃が出る（上書きしていないから遡れる）', () => {
    expect(rentTermFor(terms, '2021-12')?.rent).toBe(57000)
    expect(rentTermFor(terms, '2022-04')?.rent).toBe(55000) // 適用開始のその月から
    expect(rentTermFor(terms, '2022-03')?.rent).toBe(57000)
  })

  it('並び順がばらばらでも結果は変わらない', () => {
    expect(rentTermFor([terms[1], terms[0]], '2026-08')?.rent).toBe(55000)
  })

  it('契約より前の月には家賃が無い', () => {
    expect(rentTermFor(terms, '2018-03')).toBeUndefined()
    expect(dueOf(undefined)).toBe(0)
  })

  it('消した家賃の行は使わない', () => {
    const deleted = [...terms, term('t3', 'L', '2026-01', 99000)]
    deleted[2].deletedAt = T
    expect(rentTermFor(deleted, '2026-08')?.rent).toBe(55000)
  })

  it('いただく額は家賃＋管理費', () => {
    expect(dueOf(rentTermFor(terms, '2026-08'))).toBe(58000)
  })
})

describe('その月に契約が生きているか', () => {
  const lease: Lease = {
    id: 'L', ...base, roomId: 'R', tenantId: 'P',
    startDate: '2024-04-01', endDate: '2026-03-31', deposit: 0, keyMoney: 0,
  }

  it('始まった月から終わる月まで（両端を含む）', () => {
    expect(isActiveIn(lease, '2024-03')).toBe(false)
    expect(isActiveIn(lease, '2024-04')).toBe(true)
    expect(isActiveIn(lease, '2026-03')).toBe(true)
    expect(isActiveIn(lease, '2026-04')).toBe(false)
  })

  it('退去した日があれば、そこで終わる', () => {
    const left = { ...lease, movedOutOn: '2025-09-30' }
    expect(isActiveIn(left, '2025-09')).toBe(true)
    expect(isActiveIn(left, '2025-10')).toBe(false)
  })

  it('月の切り出しは文字のまま（時差でずれない）', () => {
    expect(monthOf('2026-08-01')).toBe('2026-08')
  })
})

describe('契約更新の近さ', () => {
  it('30日以内は赤、60日以内は黄、それより先は知らせない', () => {
    expect(renewalLevel('2026-08-25', '2026-08-11').level).toBe('red')
    expect(renewalLevel('2026-09-30', '2026-08-11').level).toBe('yellow')
    expect(renewalLevel('2027-01-15', '2026-08-11').level).toBe('none')
  })

  it('過ぎてしまった契約も赤で出す（見落とさないため）', () => {
    const r = renewalLevel('2026-08-01', '2026-08-11')
    expect(r.level).toBe('red')
    expect(r.days).toBe(-10)
  })
})

describe('月ごとの一覧の組み立て', () => {
  const rooms = [room('r2', '102', 2), room('r1', '101', 1)] // わざと逆順で渡す
  const tenants: Tenant[] = [{ id: 'p1', ...base, name: '見本 太郎', kana: 'みほん たろう' }]
  const leases: Lease[] = [{
    id: 'l1', ...base, roomId: 'r1', tenantId: 'p1',
    startDate: '2024-04-01', endDate: '2027-03-31', deposit: 0, keyMoney: 0,
  }]
  const rentTerms = [term('t1', 'l1', '2024-04', 55000)]

  it('部屋の並び順どおりに出る', () => {
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments: [] })
    expect(rows.map((r) => r.room.roomNo)).toStrictEqual(['101', '102'])
  })

  it('契約がある部屋には、入居者と金額が入る', () => {
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments: [] })
    expect(rows[0].tenant?.name).toBe('見本 太郎')
    expect(rows[0].due).toBe(58000)
    expect(rows[0].paid).toBe(false)
  })

  it('契約が無い部屋は空室として出る（金額も入金も持たない）', () => {
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments: [] })
    expect(rows[1].lease).toBeUndefined()
    expect(rows[1].due).toBe(0)
  })

  it('入金日が入っていれば「済」', () => {
    const payments: Payment[] = [
      { id: 'y1', ...base, leaseId: 'l1', month: '2026-08', amount: 58000, paidOn: '2026-08-03' },
    ]
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments })
    expect(rows[0].paid).toBe(true)
  })

  it('入金日が無ければ、行があっても「未」', () => {
    const payments: Payment[] = [
      { id: 'y1', ...base, leaseId: 'l1', month: '2026-08', amount: 58000 },
    ]
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments })
    expect(rows[0].paid).toBe(false)
  })

  it('別の月の入金を取りちがえない', () => {
    const payments: Payment[] = [
      { id: 'y1', ...base, leaseId: 'l1', month: '2026-07', amount: 58000, paidOn: '2026-07-03' },
    ]
    const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments })
    expect(rows[0].paid).toBe(false)
  })

  it('入居者が入れかわっても、その月の契約の人が出る（部屋番号で結んでいないから）', () => {
    const two: Lease[] = [
      { id: 'old', ...base, roomId: 'r1', tenantId: 'p1', startDate: '2020-01-01', endDate: '2026-05-31', deposit: 0, keyMoney: 0 },
      { id: 'new', ...base, roomId: 'r1', tenantId: 'p2', startDate: '2026-06-01', endDate: '2028-05-31', deposit: 0, keyMoney: 0 },
    ]
    const people = [...tenants, { id: 'p2', ...base, name: '見本 次郎', kana: 'みほん じろう' }]
    const terms = [term('a', 'old', '2020-01', 50000), term('b', 'new', '2026-06', 60000)]

    const may = buildMonthRows({ month: '2026-05', rooms, leases: two, tenants: people, rentTerms: terms, payments: [] })
    const aug = buildMonthRows({ month: '2026-08', rooms, leases: two, tenants: people, rentTerms: terms, payments: [] })

    expect(may[0].tenant?.name).toBe('見本 太郎')
    expect(may[0].due).toBe(53000)
    expect(aug[0].tenant?.name).toBe('見本 次郎')
    expect(aug[0].due).toBe(63000)
  })
})

describe('その月のまとめ', () => {
  const rooms = [room('r1', '101', 1), room('r2', '102', 2), room('r3', '103', 3)]
  const tenants: Tenant[] = [
    { id: 'p1', ...base, name: '甲', kana: 'こう' },
    { id: 'p3', ...base, name: '丙', kana: 'へい' },
  ]
  const leases: Lease[] = [
    { id: 'l1', ...base, roomId: 'r1', tenantId: 'p1', startDate: '2024-04-01', endDate: '2027-03-31', deposit: 0, keyMoney: 0 },
    { id: 'l3', ...base, roomId: 'r3', tenantId: 'p3', startDate: '2024-04-01', endDate: '2027-03-31', deposit: 0, keyMoney: 0 },
  ]
  const rentTerms = [term('t1', 'l1', '2024-04', 55000), term('t3', 'l3', '2024-04', 62000)]
  const payments: Payment[] = [
    { id: 'y1', ...base, leaseId: 'l1', month: '2026-08', amount: 58000, paidOn: '2026-08-03' },
  ]
  const rows = buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments })

  it('入ったお金と、入るはずのお金を分けて出す', () => {
    const s = summarize(rows)
    expect(s.received).toBe(58000)
    expect(s.expected).toBe(123000)
  })

  it('空室は「まだの部屋」に数えない', () => {
    const s = summarize(rows)
    expect(s.occupied).toBe(2)
    expect(s.unpaid.map((r) => r.room.roomNo)).toStrictEqual(['103'])
  })

  it('一部だけ入ったときは、受け取った額のほうを足す', () => {
    const half: Payment[] = [{ ...payments[0], amount: 30000 }]
    const s = summarize(buildMonthRows({ month: '2026-08', rooms, leases, tenants, rentTerms, payments: half }))
    expect(s.received).toBe(30000)
    expect(s.expected).toBe(123000)
  })

  it('全部の部屋が空なら、金額は0で「まだの部屋」も無い', () => {
    const s = summarize(buildMonthRows({ month: '2020-01', rooms, leases, tenants, rentTerms, payments }))
    expect(s).toStrictEqual({ received: 0, expected: 0, unpaid: [], occupied: 0 })
  })
})

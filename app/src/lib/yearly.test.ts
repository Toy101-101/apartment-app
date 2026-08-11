import { describe, expect, it } from 'vitest'
import type { Expense, Lease, Payment, RentTerm, Room } from '../db'
import { availableYears, buildYear } from './yearly'

/**
 * 年ごとのまとめの試験
 *
 * 確定申告に写す数字なので、ここがずれると税務署に出す紙がずれる。
 * とくに次の2つを重点的に確かめる。
 * - まだ来ていない月を「未収」に数えていないか
 * - 契約の更新で、礼金や家賃を二重に数えていないか
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const room = (no: string, sortOrder: number): Room => ({
  id: `r-${no}`, ...base, roomNo: no, floor: 1, sortOrder,
})

const lease = (
  id: string, roomNo: string, startDate: string, endDate: string,
  extra: Partial<Lease> = {},
): Lease => ({
  id, ...base, roomId: `r-${roomNo}`, tenantId: `t-${roomNo}`,
  startDate, endDate, deposit: 100000, keyMoney: 0, ...extra,
})

const term = (id: string, leaseId: string, fromMonth: string, rent: number): RentTerm => ({
  id, ...base, leaseId, fromMonth, rent, mgmtFee: 3000,
})

const payment = (leaseId: string, month: string, amount: number, paidOn?: string): Payment => ({
  id: `pay-${leaseId}-${month}`, ...base, leaseId, month, amount, paidOn,
})

const expense = (
  id: string, date: string, amount: number, kind: 'repair' | 'fixed',
  extra: Partial<Expense> = {},
): Expense => ({
  id, ...base, kind, date, title: id, amount, photoIds: [], ...extra,
})

/** 101号室に1年ぶんの契約が1つあるだけの、いちばん素直な形 */
function simple() {
  return {
    rooms: [room('101', 1)],
    leases: [lease('l-1', '101', '2026-01-01', '2026-12-31')],
    rentTerms: [term('rt-1', 'l-1', '2026-01', 57000)],
  }
}

describe('buildYear', () => {
  it('12か月ぶんの行を、記録が無くても必ず返す', () => {
    const y = buildYear({
      year: 2026, ...simple(), payments: [], expenses: [], upTo: '2026-12',
    })
    expect(y.months).toHaveLength(12)
    expect(y.months.map((m) => m.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(y.months[0].month).toBe('2026-01')
    expect(y.months[11].month).toBe('2026-12')
  })

  it('受け取った家賃だけを収入に足す', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [
        payment('l-1', '2026-01', 60000, '2026-01-05'),
        payment('l-1', '2026-02', 60000, '2026-02-05'),
        payment('l-1', '2026-03', 60000), // 入金日が無い＝まだ
      ],
      expenses: [],
      upTo: '2026-03',
    })
    expect(y.rentReceived).toBe(120000)
    expect(y.rentUnpaid).toBe(60000) // 家賃57,000＋管理費3,000
    expect(y.income).toBe(120000)
  })

  it('受け取った額が家賃と違っても、実際に受け取った額を足す', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-01', 30000, '2026-01-05')], // 半分だけ入った
      expenses: [],
      upTo: '2026-01',
    })
    expect(y.rentReceived).toBe(30000)
  })

  it('まだ来ていない月を「まだ入っていない家賃」に数えない', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-01', 60000, '2026-01-05')],
      expenses: [],
      upTo: '2026-01', // 1月の時点で今年を開いた
    })
    // 2月から12月は、まだ来ていないので未収に入らない
    expect(y.rentUnpaid).toBe(0)
    expect(y.unpaidCount).toBe(0)
    expect(y.months[1].came).toBe(false)
    expect(y.months[1].unpaid).toBe(0)
  })

  it('来た月のうち、未入金のものだけを数える', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-01', 60000, '2026-01-05')],
      expenses: [],
      upTo: '2026-03', // 3月まで来ている。2月と3月がまだ
    })
    expect(y.rentUnpaid).toBe(120000)
    expect(y.unpaidCount).toBe(2)
  })

  it('空室の月は未収に数えない', () => {
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1), room('102', 2)], // 102は契約が無い
      leases: [lease('l-1', '101', '2026-01-01', '2026-12-31')],
      rentTerms: [term('rt-1', 'l-1', '2026-01', 57000)],
      payments: [],
      expenses: [],
      upTo: '2026-01',
    })
    expect(y.months[0].unpaidRooms).toBe(1) // 101だけ
    expect(y.rentUnpaid).toBe(60000)
  })

  it('修繕と固定費を分けて足す', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [],
      expenses: [
        expense('e-1', '2026-03-10', 48000, 'repair'),
        expense('e-2', '2026-03-20', 12000, 'fixed'),
        expense('e-3', '2026-07-01', 30000, 'repair'),
      ],
      upTo: '2026-12',
    })
    expect(y.repair).toBe(78000)
    expect(y.fixed).toBe(12000)
    expect(y.expense).toBe(90000)
    expect(y.months[2].repair).toBe(48000)
    expect(y.months[2].fixed).toBe(12000)
    expect(y.months[6].repair).toBe(30000)
  })

  it('別の年の記録を混ぜない', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [
        payment('l-1', '2025-12', 60000, '2025-12-05'),
        payment('l-1', '2026-01', 60000, '2026-01-05'),
      ],
      expenses: [
        expense('e-1', '2025-12-31', 99999, 'repair'),
        expense('e-2', '2026-01-01', 10000, 'repair'),
      ],
      upTo: '2026-01',
    })
    expect(y.rentReceived).toBe(60000)
    expect(y.repair).toBe(10000)
  })

  it('12月分が翌年に入金されても、12月分としてその年に数える', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-12', 60000, '2027-01-06')],
      expenses: [],
      upTo: '2026-12',
    })
    expect(y.rentReceived).toBe(60000)
    expect(y.months[11].received).toBe(60000)
  })

  it('礼金を収入に足す。敷金は足さない', () => {
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1)],
      leases: [lease('l-1', '101', '2026-04-01', '2028-03-31', { deposit: 120000, keyMoney: 60000 })],
      rentTerms: [term('rt-1', 'l-1', '2026-04', 57000)],
      payments: [],
      expenses: [],
      upTo: '2026-03', // 家賃はまだ1件も発生していない
    })
    expect(y.keyMoney).toBe(60000)
    expect(y.income).toBe(60000) // 敷金120,000は入らない
  })

  it('契約を更新しても礼金を二重に数えない', () => {
    // renewLease は敷金を引き継ぎ、礼金は0で作る
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1)],
      leases: [
        lease('l-1', '101', '2024-04-01', '2026-03-31', { deposit: 120000, keyMoney: 60000 }),
        lease('l-2', '101', '2026-04-01', '2028-03-31', { deposit: 120000, keyMoney: 0 }),
      ],
      rentTerms: [term('rt-1', 'l-1', '2024-04', 57000), term('rt-2', 'l-2', '2026-04', 57000)],
      payments: [],
      expenses: [],
      upTo: '2026-12',
    })
    expect(y.keyMoney).toBe(0)
  })

  it('更新をまたいでも、ひと月ぶんの家賃を二重に数えない', () => {
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1)],
      leases: [
        lease('l-1', '101', '2024-04-01', '2026-03-31'),
        lease('l-2', '101', '2026-04-01', '2028-03-31'),
      ],
      rentTerms: [term('rt-1', 'l-1', '2024-04', 57000), term('rt-2', 'l-2', '2026-04', 60000)],
      payments: [
        payment('l-1', '2026-01', 60000, '2026-01-05'),
        payment('l-1', '2026-02', 60000, '2026-02-05'),
        payment('l-1', '2026-03', 60000, '2026-03-05'),
        payment('l-2', '2026-04', 63000, '2026-04-05'),
      ],
      expenses: [],
      upTo: '2026-04',
    })
    expect(y.rentReceived).toBe(243000)
    expect(y.months[2].received).toBe(60000)
    expect(y.months[3].received).toBe(63000)
    expect(y.rentUnpaid).toBe(0)
  })

  it('家賃を変えた年は、変えた月から新しい額で未収を数える', () => {
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1)],
      leases: [lease('l-1', '101', '2026-01-01', '2026-12-31')],
      rentTerms: [term('rt-1', 'l-1', '2026-01', 57000), term('rt-2', 'l-1', '2026-07', 60000)],
      payments: [],
      expenses: [],
      upTo: '2026-07',
    })
    // 1〜6月は60,000（57,000＋3,000）、7月は63,000
    expect(y.months[0].unpaid).toBe(60000)
    expect(y.months[6].unpaid).toBe(63000)
    expect(y.rentUnpaid).toBe(60000 * 6 + 63000)
  })

  it('退去した月より後は未収に数えない', () => {
    const y = buildYear({
      year: 2026,
      rooms: [room('101', 1)],
      leases: [lease('l-1', '101', '2026-01-01', '2026-12-31', { movedOutOn: '2026-03-15' })],
      rentTerms: [term('rt-1', 'l-1', '2026-01', 57000)],
      payments: [],
      expenses: [],
      upTo: '2026-12',
    })
    expect(y.unpaidCount).toBe(3) // 1月・2月・3月だけ
    expect(y.months[3].unpaid).toBe(0)
  })

  it('消した記録は数えない', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-01', 60000, '2026-01-05')],
      expenses: [
        expense('e-1', '2026-01-10', 50000, 'repair'),
        expense('e-2', '2026-01-11', 90000, 'repair', { deletedAt: T }),
      ],
      upTo: '2026-01',
    })
    expect(y.repair).toBe(50000)
  })

  it('差引は「入ったお金 − 出ていったお金」', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [payment('l-1', '2026-01', 60000, '2026-01-05')],
      expenses: [expense('e-1', '2026-01-10', 25000, 'repair')],
      upTo: '2026-01',
    })
    expect(y.income).toBe(60000)
    expect(y.expense).toBe(25000)
    expect(y.net).toBe(35000)
  })

  it('出ていったほうが多ければ差引はマイナスになる', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [],
      expenses: [expense('e-1', '2026-01-10', 250000, 'repair')],
      upTo: '2026-01',
    })
    expect(y.net).toBe(-250000)
  })

  it('記録が1件も無い年は empty になる', () => {
    const y = buildYear({
      year: 2020,
      ...simple(),
      payments: [],
      expenses: [],
      upTo: '2026-12',
    })
    expect(y.empty).toBe(true)
  })

  it('未収があれば empty ではない', () => {
    const y = buildYear({
      year: 2026,
      ...simple(),
      payments: [],
      expenses: [],
      upTo: '2026-01',
    })
    expect(y.empty).toBe(false)
  })

  it('upTo を渡さなければ今月までを「来た月」とする', () => {
    const y = buildYear({ year: 2026, ...simple(), payments: [], expenses: [] })
    expect(y.months.filter((m) => m.came).length).toBeGreaterThan(0)
  })
})

describe('availableYears', () => {
  it('新しい年から順に並べる', () => {
    const years = availableYears({
      leases: [lease('l-1', '101', '2024-04-01', '2027-03-31')],
      payments: [payment('l-1', '2026-01', 60000)],
      expenses: [expense('e-1', '2025-05-01', 1000, 'repair')],
      now: '2026-08-11',
    })
    expect(years).toEqual([2026, 2025, 2024])
  })

  it('途中の年が抜けていても、続けて並べる', () => {
    const years = availableYears({
      leases: [lease('l-1', '101', '2020-04-01', '2030-03-31')],
      payments: [],
      expenses: [],
      now: '2026-08-11',
    })
    expect(years).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020])
  })

  it('記録が1件も無くても、今年だけは出す', () => {
    expect(availableYears({ leases: [], payments: [], expenses: [], now: '2026-08-11' }))
      .toEqual([2026])
  })

  it('消した記録の年は数に入れない', () => {
    const years = availableYears({
      leases: [lease('l-1', '101', '2019-04-01', '2020-03-31', { deletedAt: T })],
      payments: [],
      expenses: [],
      now: '2026-08-11',
    })
    expect(years).toEqual([2026])
  })
})

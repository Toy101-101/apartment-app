import { describe, expect, it } from 'vitest'
import type {
  Equipment, Expense, Lease, MoveOut, Note, Payment, RentTerm, Room, Schedule, Tenant,
} from '../db'
import { buildActivity, type ActivityInput } from './activity'

/**
 * 最近の操作の試験
 *
 * いちばん壊れやすいのは「**1つの操作が1行にまとまるか**」。
 * 契約を1件登録すると入居者・契約・家賃の3行が同時に書かれるので、
 * まとめ損ねると、それだけで画面が埋まってしまう。
 */

const room = (id: string, roomNo: string): Room =>
  ({ id, createdAt: 'c', updatedAt: 'c', roomNo, floor: 1, sortOrder: 1 })

const tenant = (id: string, name: string): Tenant =>
  ({ id, createdAt: 'c', updatedAt: 'c', name, kana: '' })

const lease = (id: string, at: string, extra: Partial<Lease> = {}): Lease => ({
  id, createdAt: at, updatedAt: at,
  roomId: 'r1', tenantId: 't1',
  startDate: '2024-04-01', endDate: '2026-03-31', deposit: 0, keyMoney: 0,
  ...extra,
})

const empty: ActivityInput = {
  rooms: [room('r1', '101')],
  tenants: [tenant('t1', '田中 一郎')],
  leases: [], rentTerms: [], payments: [], expenses: [],
  notes: [], schedules: [], equipment: [], moveOuts: [],
}

describe('buildActivity', () => {
  it('何も無ければ空', () => {
    expect(buildActivity(empty)).toStrictEqual([])
  })

  it('新しいものが先に来る', () => {
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', '2026-08-01T00:00:00.000Z'), lease('l2', '2026-08-10T00:00:00.000Z')],
    })
    expect(rows.map((r) => r.at)).toStrictEqual([
      '2026-08-10T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
    ])
  })

  it('作った・直した・消したを見分ける', () => {
    const rows = buildActivity({
      ...empty,
      leases: [
        lease('l1', '2026-08-01T00:00:00.000Z'),
        lease('l2', '2026-08-01T00:00:00.000Z', { updatedAt: '2026-08-02T00:00:00.000Z' }),
        lease('l3', '2026-08-01T00:00:00.000Z', {
          updatedAt: '2026-08-03T00:00:00.000Z', deletedAt: '2026-08-03T00:00:00.000Z',
        }),
      ],
    })
    expect(rows.map((r) => r.action)).toStrictEqual(['消した', '直した', '作った'])
  })

  /*
   * ここが要。createContract は入居者・契約・家賃を1つの時刻で書くので、
   * 時刻でまとめれば1行になる。まとめ損ねると3行に増える
   */
  it('同じ時刻に書かれたものは、1つの操作にまとめる', () => {
    const at = '2026-08-12T01:00:00.000Z'
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', at)],
      rentTerms: [{
        id: 'rt1', createdAt: at, updatedAt: at,
        leaseId: 'l1', fromMonth: '2024-04', rent: 58000, mgmtFee: 3000,
      } satisfies RentTerm],
    })
    expect(rows).toHaveLength(1)
  })

  it('まとめるときは、契約のほうで説明する（家賃の行ではなく）', () => {
    const at = '2026-08-12T01:00:00.000Z'
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', at)],
      rentTerms: [{
        id: 'rt1', createdAt: at, updatedAt: at,
        leaseId: 'l1', fromMonth: '2024-04', rent: 58000, mgmtFee: 3000,
      } satisfies RentTerm],
    })
    expect(rows[0].what).toBe('101号室 田中 一郎 の契約')
    expect(rows[0].where).toBe('① 入居者・契約')
  })

  it('家賃だけを変えたときは、家賃の行として出る', () => {
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', '2026-01-01T00:00:00.000Z')],
      rentTerms: [{
        id: 'rt1', createdAt: '2026-08-12T02:00:00.000Z', updatedAt: '2026-08-12T02:00:00.000Z',
        leaseId: 'l1', fromMonth: '2026-09', rent: 56000, mgmtFee: 3000,
      } satisfies RentTerm],
    })
    expect(rows[0].where).toBe('① 家賃の変更')
    expect(rows[0].what).toBe('101号室 田中 一郎 の家賃')
  })

  it('入金は、何月分かと部屋が分かる', () => {
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', '2026-01-01T00:00:00.000Z')],
      payments: [{
        id: 'p1', createdAt: '2026-08-12T03:00:00.000Z', updatedAt: '2026-08-12T03:00:00.000Z',
        leaseId: 'l1', month: '2026-08', amount: 61000, paidOn: '2026-08-05',
      } satisfies Payment],
    })
    expect(rows[0].what).toBe('令和8年8月分 101号室 田中 一郎 の入金')
    expect(rows[0].to).toBe('/payments')
  })

  it('設備は呼び名で出る（③の記録と同じ言い方になる）', () => {
    const rows = buildActivity({
      ...empty,
      equipment: [{
        id: 'e1', createdAt: '2026-08-12T04:00:00.000Z', updatedAt: '2026-08-12T04:00:00.000Z',
        kind: 'other', name: '受水槽', installedOn: '2004-04', lifeYears: 22,
      } satisfies Equipment],
    })
    expect(rows[0].what).toBe('建物全体 受水槽')
  })

  it('部屋と入居者だけの行は出さない（契約の操作について回るだけのため）', () => {
    const rows = buildActivity({
      ...empty,
      rooms: [{ ...room('r1', '101'), updatedAt: '2026-08-12T05:00:00.000Z' }],
      tenants: [{ ...tenant('t1', '田中 一郎'), updatedAt: '2026-08-12T05:00:00.000Z' }],
    })
    expect(rows).toStrictEqual([])
  })

  it('件数を絞れる（既定は20件）', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      lease(`l${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`))
    expect(buildActivity({ ...empty, leases: many })).toHaveLength(20)
    expect(buildActivity({ ...empty, leases: many, limit: 5 })).toHaveLength(5)
  })

  it('契約が見つからなくても落ちない（消した契約のメモなど）', () => {
    const rows = buildActivity({
      ...empty,
      payments: [{
        id: 'p1', createdAt: '2026-08-12T06:00:00.000Z', updatedAt: '2026-08-12T06:00:00.000Z',
        leaseId: 'ない-id', month: '2026-08', amount: 61000,
      } satisfies Payment],
    })
    expect(rows[0].what).toContain('（契約なし）')
  })

  it('費用・予定・退去・メモも出る', () => {
    const rows = buildActivity({
      ...empty,
      leases: [lease('l1', '2026-01-01T00:00:00.000Z')],
      expenses: [{
        id: 'x1', createdAt: '2026-08-12T07:00:00.000Z', updatedAt: '2026-08-12T07:00:00.000Z',
        kind: 'repair', date: '2026-08-12', title: '給湯器の取り替え', amount: 180000, photoIds: [],
      } satisfies Expense],
      schedules: [{
        id: 's1', createdAt: '2026-08-12T08:00:00.000Z', updatedAt: '2026-08-12T08:00:00.000Z',
        title: '火災保険の更新', kind: 'insurance',
        nextDate: '2027-05-20', everyMonths: 12, noticeDays: 60,
      } satisfies Schedule],
      moveOuts: [{
        id: 'm1', createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T09:00:00.000Z',
        leaseId: 'l1', done: [], deductions: [],
      } satisfies MoveOut],
      notes: [{
        id: 'n1', createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z',
        targetType: 'lease', targetId: 'l1', date: '2026-08-12', author: '祖父',
        body: 'あ', byVoice: false,
      } satisfies Note],
    })
    expect(rows.map((r) => r.where)).toStrictEqual([
      '① いきさつメモ', '退去の手続き', '⑤ 年間の予定', '③ 修繕・費用', '① 入居者・契約',
    ])
  })
})

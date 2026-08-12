// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { buildMonthRows, summarize } from './rent'
import { createContract } from './contracts'
import { clearSample, hasSampleData, loadSample, removeSample } from './sample'

/**
 * 見本データの試験
 *
 * 画面を開かなくても「入れたら何が見えるはずか」をここで押さえておく。
 * 実機で祖父に触ってもらう前に、見本が壊れていないことを毎回確かめる。
 */

async function rowsOf(month: string) {
  const [rooms, leases, tenants, rentTerms, payments] = await Promise.all([
    db.rooms.toArray(), db.leases.toArray(), db.tenants.toArray(),
    db.rentTerms.toArray(), db.payments.where('month').equals(month).toArray(),
  ])
  return buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await loadSample()
})

describe('見本データ', () => {
  it('10部屋・9人・9契約が入る（うち1件は退去ずみ）', async () => {
    expect(await db.rooms.count()).toBe(10)
    expect(await db.tenants.count()).toBe(9)
    expect(await db.leases.count()).toBe(9)
    expect((await db.leases.get('l-102'))?.movedOutOn).toBe('2026-06-30')
  })

  it('①〜⑥のどの画面にも中身がある（空の画面を見せない）', async () => {
    expect(await db.expenses.count()).toBeGreaterThan(0)
    expect(await db.schedules.count()).toBeGreaterThan(0)
    expect(await db.equipment.count()).toBeGreaterThan(0)
    expect(await db.moveOuts.count()).toBe(1)
  })

  it('⑤には「過ぎているもの」が必ず1つある（お知らせ枠が空にならない）', async () => {
    const { buildScheduleRows, needsAttention } = await import('./schedules')
    const rows = buildScheduleRows(await db.schedules.toArray(), '2026-08-12')
    expect(rows[0].days).toBeLessThan(0)
    expect(needsAttention(rows).length).toBeGreaterThan(0)
  })

  it('⑥には「替え時を過ぎたもの」と「取り替えた履歴」の両方がある', async () => {
    const { buildEquipmentRows, overdue, replacedHistory } = await import('./equipment')
    const all = await db.equipment.toArray()
    const rows = buildEquipmentRows({ equipment: all, rooms: await db.rooms.toArray(), on: '2026-08-12' })
    expect(overdue(rows).length).toBeGreaterThan(0)
    expect(replacedHistory(all)).toHaveLength(1)
  })

  it('退去の手続きは途中まで（残りがあるからホームに出る）', async () => {
    const { remainingCount } = await import('./moveout')
    expect(remainingCount(await db.moveOuts.get('mo-102'))).toBeGreaterThan(0)
  })

  it('102と203は空室として出る', async () => {
    const rows = await rowsOf('2026-08')
    const vacant = rows.filter((r) => !r.lease).map((r) => r.room.roomNo)
    expect(vacant).toStrictEqual(['102', '203'])
  })

  it('令和8年8月分は、103と202だけがまだ', async () => {
    const s = summarize(await rowsOf('2026-08'))
    expect(s.unpaid.map((r) => r.room.roomNo)).toStrictEqual(['103', '202'])
    expect(s.occupied).toBe(8)
  })

  it('令和8年7月分は、全部そろっている', async () => {
    const s = summarize(await rowsOf('2026-07'))
    expect(s.unpaid).toStrictEqual([])
    expect(s.received).toBe(s.expected)
  })

  it('過去の月をひらくと、当時の家賃が出る（101号室は2022年に下げた）', async () => {
    const before = (await rowsOf('2022-03')).find((r) => r.room.roomNo === '101')
    const after = (await rowsOf('2022-04')).find((r) => r.room.roomNo === '101')
    expect(before?.due).toBe(60000) // 57,000 ＋ 管理費3,000
    expect(after?.due).toBe(58000) // 55,000 ＋ 管理費3,000
  })

  it('契約が始まる前の月は、その部屋も空室になる', async () => {
    const rows = await rowsOf('2018-01')
    expect(rows.every((r) => !r.lease)).toBe(true)
  })

  it('もう一度入れても、二重にならない', async () => {
    await loadSample()
    expect(await db.rooms.count()).toBe(10)
    // 1〜6月が9室ぶん、7月が8室ぶん、8月が6室ぶん
    expect(await db.payments.count()).toBe(9 * 6 + 8 + 6)
    expect(await db.equipment.count()).toBe(8)
  })

  it('全部消すと空になる（設定の meta は残す）', async () => {
    await db.meta.put({ key: 'test', value: '1', updatedAt: '2026-08-11T00:00:00.000Z' })
    await clearSample()
    expect(await db.rooms.count()).toBe(0)
    expect(await db.payments.count()).toBe(0)
    expect(await db.meta.count()).toBe(1)
  })
})

describe('見本だけを消す', () => {
  it('入っているかどうかが分かる', async () => {
    expect(await hasSampleData()).toBe(true)
    await removeSample()
    expect(await hasSampleData()).toBe(false)
  })

  it('見本はきれいに消える', async () => {
    await removeSample()
    for (const table of [
      db.rooms, db.tenants, db.leases, db.rentTerms, db.payments, db.notes,
      db.expenses, db.schedules, db.equipment, db.moveOuts,
    ]) {
      expect(await table.count()).toBe(0)
    }
  })

  it('本物の記録は消さない（ここが肝心）', async () => {
    const real = await createContract({
      roomNo: '301', name: '本物 太郎', kana: 'ほんもの たろう',
      startDate: '2026-08-01', endDate: '2028-07-31',
      deposit: 100000, keyMoney: 50000, rent: 60000, mgmtFee: 3000,
    })
    await removeSample()

    expect(await db.leases.get(real)).toBeDefined()
    expect(await db.rooms.count()).toBe(1)
    expect(await db.tenants.count()).toBe(1)
    expect(await db.rentTerms.count()).toBe(1)
    expect((await db.tenants.toArray())[0].name).toBe('本物 太郎')
  })

  it('見本の入金につけた操作の履歴も片づく', async () => {
    const { togglePaid } = await import('./payments')
    await togglePaid({ leaseId: 'l-101', month: '2026-08', due: 58000, roomNo: '101' })
    expect(await db.paymentLog.count()).toBe(1)

    await removeSample()
    expect(await db.paymentLog.count()).toBe(0)
  })
})

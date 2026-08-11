// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { buildMonthRows, summarize } from './rent'
import { clearSample, loadSample } from './sample'

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
  it('10部屋・8人・8契約が入る', async () => {
    expect(await db.rooms.count()).toBe(10)
    expect(await db.tenants.count()).toBe(8)
    expect(await db.leases.count()).toBe(8)
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
    expect(await db.payments.count()).toBe(14)
  })

  it('全部消すと空になる（設定の meta は残す）', async () => {
    await db.meta.put({ key: 'test', value: '1', updatedAt: '2026-08-11T00:00:00.000Z' })
    await clearSample()
    expect(await db.rooms.count()).toBe(0)
    expect(await db.payments.count()).toBe(0)
    expect(await db.meta.count()).toBe(1)
  })
})

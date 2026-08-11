// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, it, expect } from 'vitest'

/**
 * 表を足したときに、前からあったデータが消えていないかを確かめる。
 *
 * これは一度きりの試験ではない。version(3), version(4) と増やすたびに、
 * 「その前の版で入れたものが残るか」を必ずここに足していくこと。
 * 祖父のスマホには、作り直せない記録が入っている。
 */
describe('記録した時刻', () => {
  it('立て続けに呼んでも、必ず前より後になる（履歴の前後が入れかわらない）', async () => {
    const { now } = await import('./db')
    const stamps = Array.from({ length: 500 }, () => now())
    const sorted = [...stamps].sort()
    expect(stamps).toStrictEqual(sorted)
    expect(new Set(stamps).size).toBe(stamps.length)
  })
})

describe('表を足したときの引き継ぎ', () => {
  it('版1（meta だけ）で保存したものが、版2に上がっても残る', async () => {
    // まず、フェーズ0のアプリと同じ形でデータベースを作って中身を入れる
    const old = new Dexie('apartment')
    old.version(1).stores({ meta: '&key' })
    await old.open()
    await old.table('meta').put({
      key: 'checkCount',
      value: '4',
      updatedAt: '2026-08-10T02:14:31.000Z',
    })
    old.close()

    // そのうえで、いまのアプリを開く（ここで版1 → 版2 の引き上げが起きる）
    const { db, SCHEMA_VERSION, newId, now } = await import('./db')
    await db.open()

    expect(db.verno).toBe(SCHEMA_VERSION)
    expect((await db.meta.get('checkCount'))?.value).toBe('4')

    // 足した表がそのまま使えること
    const at = now()
    await db.rooms.put({
      id: newId(), createdAt: at, updatedAt: at,
      roomNo: '101', floor: 1, sortOrder: 1,
    })
    expect(await db.rooms.count()).toBe(1)
    expect(db.tables.map((t) => t.name).sort()).toStrictEqual([
      'expenses', 'leases', 'meta', 'notes', 'paymentLog',
      'payments', 'photos', 'rentTerms', 'rooms', 'tenants',
    ])
  })
})

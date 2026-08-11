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
      'equipment', 'expenses', 'leases', 'meta', 'notes', 'paymentLog',
      'payments', 'photos', 'rentTerms', 'rooms', 'schedules', 'tenants',
    ])
  })

  it('版2（本体10表）で保存したものが、版3に上がっても残る', async () => {
    // フェーズ1〜6のアプリと同じ形でデータベースを作り、契約を1件入れる
    const old = new Dexie('apartment')
    old.version(1).stores({ meta: '&key' })
    old.version(2).stores({
      meta: '&key',
      rooms: 'id, roomNo, sortOrder',
      tenants: 'id, kana',
      leases: 'id, roomId, tenantId, endDate',
      rentTerms: 'id, leaseId, [leaseId+fromMonth]',
      payments: 'id, leaseId, month, [leaseId+month]',
      paymentLog: 'id, paymentId, at',
      expenses: 'id, kind, date, roomId',
      photos: 'id, createdAt',
      notes: 'id, targetType, date, [targetType+targetId]',
    })
    await old.open()
    await old.table('leases').put({
      id: 'l-1', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      roomId: 'r-1', tenantId: 't-1',
      startDate: '2026-04-01', endDate: '2028-03-31', deposit: 110000, keyMoney: 55000,
    })
    old.close()

    // いまのアプリを開く（ここで版2 → 版3 の引き上げが起きる）
    const { db, SCHEMA_VERSION, newId, now } = await import('./db')
    await db.open()

    expect(db.verno).toBe(SCHEMA_VERSION)
    expect((await db.leases.get('l-1'))?.deposit).toBe(110000)

    // 足した表がそのまま使えること
    const at = now()
    await db.schedules.put({
      id: newId(), createdAt: at, updatedAt: at,
      title: '火災保険の更新', kind: 'insurance',
      nextDate: '2027-04-01', everyMonths: 12, noticeDays: 60,
    })
    expect(await db.schedules.count()).toBe(1)
  })

  it('版3（年間の予定まで）で保存したものが、版4に上がっても残る', async () => {
    const old = new Dexie('apartment')
    old.version(1).stores({ meta: '&key' })
    old.version(2).stores({
      meta: '&key',
      rooms: 'id, roomNo, sortOrder',
      tenants: 'id, kana',
      leases: 'id, roomId, tenantId, endDate',
      rentTerms: 'id, leaseId, [leaseId+fromMonth]',
      payments: 'id, leaseId, month, [leaseId+month]',
      paymentLog: 'id, paymentId, at',
      expenses: 'id, kind, date, roomId',
      photos: 'id, createdAt',
      notes: 'id, targetType, date, [targetType+targetId]',
    })
    old.version(3).stores({ schedules: 'id, nextDate, kind' })
    await old.open()
    await old.table('schedules').put({
      id: 's-1', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
      title: '火災保険の更新', kind: 'insurance',
      nextDate: '2027-04-01', everyMonths: 12, noticeDays: 60,
    })
    old.close()

    const { db, SCHEMA_VERSION, newId, now } = await import('./db')
    await db.open()

    expect(db.verno).toBe(SCHEMA_VERSION)
    expect((await db.schedules.get('s-1'))?.title).toBe('火災保険の更新')

    const at = now()
    await db.equipment.put({
      id: newId(), createdAt: at, updatedAt: at,
      kind: 'waterHeater', installedOn: '2014-04', lifeYears: 12,
    })
    expect(await db.equipment.count()).toBe(1)
  })
})

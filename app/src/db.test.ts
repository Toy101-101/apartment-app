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
 *
 * **いちばん大事な注意。**
 * 版上げは「前の版のデータベースが実際にそこにある」ときにしか起きない。
 * 前の試験が開いたままだと、もう版5になっているので何も起こらず、
 * 「緑になったのに、実は一度も版上げを通っていない」試験になる。
 * だから毎回、閉じて・消して・古い版から作り直す（`seedOld`）。
 * そのうえで「入れた直後は古い版だったこと」も確かめる。
 */

/** 古い版の形（アプリの `db.ts` にある history と同じもの。書きかえない） */
const V1 = (d: Dexie) => {
  d.version(1).stores({ meta: '&key' })
}
const V2 = (d: Dexie) => {
  V1(d)
  d.version(2).stores({
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
}
const V3 = (d: Dexie) => {
  V2(d)
  d.version(3).stores({ schedules: 'id, nextDate, kind' })
}
const V4 = (d: Dexie) => {
  V3(d)
  d.version(4).stores({ equipment: 'id, roomId, kind, installedOn' })
}

/**
 * いまのアプリのデータベースを閉じて跡形もなく消し、古い版で作り直して中身を入れる。
 *
 * 入れ終わった時点の版を返す。呼ぶ側で確かめて、
 * 「本当に古い版から始まったか」を試験のたびに押さえる。
 */
async function seedOld(
  build: (d: Dexie) => void,
  fill: (d: Dexie) => Promise<void>,
): Promise<number> {
  const { db } = await import('./db')
  db.close()
  await Dexie.delete(db.name)

  const old = new Dexie(db.name)
  build(old)
  await old.open()
  await fill(old)
  const verno = old.verno
  old.close()
  return verno
}

/** いまのアプリを開く（ここで版上げが起きる） */
async function openApp() {
  const mod = await import('./db')
  await mod.db.open()
  return mod
}

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
  it('版1（meta だけ）で保存したものが、いまの版に上がっても残る', async () => {
    // まず、フェーズ0のアプリと同じ形でデータベースを作って中身を入れる
    const was = await seedOld(V1, async (old) => {
      await old.table('meta').put({
        key: 'checkCount',
        value: '4',
        updatedAt: '2026-08-10T02:14:31.000Z',
      })
    })
    expect(was).toBe(1) // ここが1でなければ、版上げを確かめたことにならない

    // そのうえで、いまのアプリを開く（ここで版1 → いまの版の引き上げが起きる）
    const { db, SCHEMA_VERSION, newId, now } = await openApp()

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
      'equipment', 'expenses', 'leases', 'meta', 'moveOuts', 'notes', 'paymentLog',
      'payments', 'photos', 'rentTerms', 'rooms', 'schedules', 'tenants',
    ])
  })

  it('版2（本体10表）で保存したものが、版3に上がっても残る', async () => {
    // フェーズ1〜6のアプリと同じ形でデータベースを作り、契約を1件入れる
    const was = await seedOld(V2, async (old) => {
      await old.table('leases').put({
        id: 'l-1', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
        roomId: 'r-1', tenantId: 't-1',
        startDate: '2026-04-01', endDate: '2028-03-31', deposit: 110000, keyMoney: 55000,
      })
    })
    expect(was).toBe(2)

    const { db, SCHEMA_VERSION, newId, now } = await openApp()

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
    const was = await seedOld(V3, async (old) => {
      await old.table('schedules').put({
        id: 's-1', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
        title: '火災保険の更新', kind: 'insurance',
        nextDate: '2027-04-01', everyMonths: 12, noticeDays: 60,
      })
    })
    expect(was).toBe(3)

    const { db, SCHEMA_VERSION, newId, now } = await openApp()

    expect(db.verno).toBe(SCHEMA_VERSION)
    expect((await db.schedules.get('s-1'))?.title).toBe('火災保険の更新')

    const at = now()
    await db.equipment.put({
      id: newId(), createdAt: at, updatedAt: at,
      kind: 'waterHeater', installedOn: '2014-04', lifeYears: 12,
    })
    expect(await db.equipment.count()).toBe(1)
  })

  it('版4（設備の年式まで）で保存したものが、版5に上がっても残る', async () => {
    const was = await seedOld(V4, async (old) => {
      await old.table('equipment').put({
        id: 'e-1', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
        kind: 'waterHeater', installedOn: '2014-04', lifeYears: 12,
      })
    })
    expect(was).toBe(4)

    const { db, SCHEMA_VERSION, newId, now } = await openApp()

    expect(db.verno).toBe(SCHEMA_VERSION)
    expect((await db.equipment.get('e-1'))?.installedOn).toBe('2014-04')

    const at = now()
    await db.moveOuts.put({
      id: newId(), createdAt: at, updatedAt: at,
      leaseId: 'l-1', done: ['keys'], deductions: [],
    })
    expect(await db.moveOuts.count()).toBe(1)
  })

  it('前の試験の中身が残っていない（まっさらから始まっている）', async () => {
    // ここが通らないと、上の4つは「消し忘れた前の版」を見ているだけになる
    const was = await seedOld(V1, async () => {})
    expect(was).toBe(1)

    const { db } = await openApp()
    expect(await db.equipment.count()).toBe(0)
    expect(await db.moveOuts.count()).toBe(0)
    expect(await db.leases.count()).toBe(0)
  })
})

// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  SCHEMA_VERSION,
  type Expense,
  type Lease,
  type Note,
  type Payment,
  type PaymentLogRow,
  type RentTerm,
  type Room,
  type Tenant,
} from '../db'
import {
  BACKUP_FORMAT,
  backupFileName,
  createBackup,
  importBackupJson,
  importPhotoFiles,
  parseBackup,
  photoFileName,
  photoIdFromFileName,
  readAll,
  toJson,
} from './backup'
import { BACKUP_V1_JSON } from './fixtures/backup-v1'

/**
 * 控えの試験
 *
 * ここが通らないうちは、他の機能を作ってはいけない。
 * データを守る仕組みを、データより先に確かめる。
 */

const T1 = '2026-04-01T00:00:00.000Z'
const T2 = '2026-08-10T02:00:00.000Z'

const room: Room = {
  id: 'room-101', createdAt: T1, updatedAt: T1,
  roomNo: '101', floor: 1, sortOrder: 1, memo: '角部屋',
}

const tenant: Tenant = {
  id: 'tenant-a', createdAt: T1, updatedAt: T1,
  name: '見本 太郎', kana: 'みほん たろう', phone: '090-0000-0000',
  guarantorName: '見本 花子', guarantorPhone: '090-1111-1111',
  contactNote: '耳が遠いので手紙が確実',
}

const lease: Lease = {
  id: 'lease-1', createdAt: T1, updatedAt: T1,
  roomId: room.id, tenantId: tenant.id,
  startDate: '2024-04-01', endDate: '2026-03-31',
  deposit: 110000, keyMoney: 55000,
}

const rentTerm: RentTerm = {
  id: 'rent-1', createdAt: T1, updatedAt: T1,
  leaseId: lease.id, fromMonth: '2024-04', rent: 55000, mgmtFee: 3000,
  reason: '更新のとき2,000円下げた（長く住んでもらうため）',
}

const paidPayment: Payment = {
  id: 'pay-1', createdAt: T1, updatedAt: T2,
  leaseId: lease.id, month: '2026-08', amount: 58000,
  paidOn: '2026-08-03', method: 'transfer', memo: '',
}

// 「未」の入金には paidOn を入れない。ここが済／未の2状態の全て
const unpaidPayment: Payment = {
  id: 'pay-2', createdAt: T1, updatedAt: T1,
  leaseId: lease.id, month: '2026-09', amount: 58000,
}

const log: PaymentLogRow = {
  id: 'log-1', createdAt: T2, updatedAt: T2,
  paymentId: paidPayment.id, at: T2, who: '祖父', action: 'markPaid',
}

const expense: Expense = {
  id: 'exp-1', createdAt: T2, updatedAt: T2,
  kind: 'repair', date: '2026-07-20', title: '給湯器の交換', amount: 128000,
  vendor: '見本設備', roomId: room.id, photoIds: ['photo-1'],
}

const note: Note = {
  id: 'note-1', createdAt: T2, updatedAt: T2,
  targetType: 'lease', targetId: lease.id, date: '2026-07-20',
  author: '祖父', body: '雨漏りの相談を受けた。次の更新で家賃を据え置くと伝えた。',
  byVoice: true,
}

async function seed() {
  await db.meta.put({ key: 'lastShareAt', value: '2026-08-10', updatedAt: T2 })
  await db.rooms.put(room)
  await db.tenants.put(tenant)
  await db.leases.put(lease)
  await db.rentTerms.put(rentTerm)
  await db.payments.bulkPut([paidPayment, unpaidPayment])
  await db.paymentLog.put(log)
  await db.expenses.put(expense)
  await db.notes.put(note)
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('控えの書き出し', () => {
  it('版（schemaVersion）が必ず入る', async () => {
    const backup = await createBackup()
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION)
    expect(backup.format).toBe(BACKUP_FORMAT)
  })

  it('中身が空でも書き出せる（初日でも控えを送れる）', async () => {
    const backup = await createBackup()
    expect(backup.counts.rooms).toBe(0)
    expect(() => JSON.parse(toJson(backup))).not.toThrow()
  })

  it('何件入っているかが、開かなくても分かる', async () => {
    await seed()
    const backup = await createBackup()
    expect(backup.counts).toStrictEqual({
      meta: 1, rooms: 1, tenants: 1, leases: 1, rentTerms: 1,
      payments: 2, paymentLog: 1, expenses: 1, notes: 1, schedules: 0, equipment: 0,
      moveOuts: 0,
    })
  })

  it('書き出した日時が入る', async () => {
    const backup = await createBackup(new Date('2026-08-10T02:15:00.000Z'))
    expect(backup.exportedAt).toBe('2026-08-10T02:15:00.000Z')
  })

  it('ファイル名は日付つきで読める形', () => {
    expect(backupFileName('2026-08-10')).toBe('控え-2026-08-10.json')
  })
})

describe('書き出す → 読み込む → 完全一致', () => {
  it('文字にして読み直しても、中身が1文字も変わらない', async () => {
    await seed()
    const before = await createBackup()
    const after = parseBackup(toJson(before))
    expect(after.data).toStrictEqual(before.data)
    expect(after.schemaVersion).toBe(before.schemaVersion)
    expect(after.counts).toStrictEqual(before.counts)
  })

  it('端末に書き戻して、もう一度書き出しても同じになる', async () => {
    await seed()
    const before = await createBackup()
    const json = toJson(before)

    // いったん全部消してから読み込む（別の端末に移した状況）
    await Promise.all(db.tables.map((t) => t.clear()))
    expect((await readAll()).rooms).toHaveLength(0)

    await importBackupJson(json)
    const after = await createBackup()
    expect(after.data).toStrictEqual(before.data)
    // 書き出した時刻だけをそろえれば、ファイルは1文字も違わない
    expect(toJson({ ...after, exportedAt: before.exportedAt })).toBe(json)
  })

  it('「未」の入金が「済」に化けない', async () => {
    await seed()
    const json = toJson(await createBackup())
    await Promise.all(db.tables.map((t) => t.clear()))
    await importBackupJson(json)

    const back = await db.payments.get('pay-2')
    expect(back?.paidOn).toBeUndefined()
    expect((await db.payments.get('pay-1'))?.paidOn).toBe('2026-08-03')
  })

  it('読み込むと、いま端末にある古い中身は置き換わる', async () => {
    await seed()
    const json = toJson(await createBackup())

    await db.rooms.put({ ...room, id: 'room-999', roomNo: '999' })
    await importBackupJson(json)

    const rooms = await db.rooms.toArray()
    expect(rooms.map((r) => r.id)).toStrictEqual(['room-101'])
  })
})

describe('写真の扱い', () => {
  it('控えJSONに写真は入らない（枚数だけ伝える）', async () => {
    await seed()
    await db.photos.put({
      id: 'photo-1', createdAt: T2, updatedAt: T2,
      blob: new Blob(['見本の画像'], { type: 'image/jpeg' }),
      mime: 'image/jpeg', width: 1600, height: 1200,
    })

    const backup = await createBackup()
    expect(backup.photoCount).toBe(1)
    expect(Object.keys(backup.data)).not.toContain('photos')
    expect(toJson(backup)).not.toContain('見本の画像')
    // 費用から写真への結びつき（photoIds）は控えに残る
    expect(backup.data.expenses[0].photoIds).toStrictEqual(['photo-1'])
  })

  it('控えを読み込んでも、端末の写真は消えない', async () => {
    await db.photos.put({
      id: 'photo-1', createdAt: T2, updatedAt: T2,
      blob: new Blob(['見本の画像'], { type: 'image/jpeg' }),
      mime: 'image/jpeg', width: 1600, height: 1200,
    })
    await importBackupJson(toJson(await createBackup()))
    expect(await db.photos.count()).toBe(1)
  })
})

describe('写真を別のファイルとして渡す', () => {
  it('ファイル名に id を入れておく（どの記録の写真かを結び直せるように）', () => {
    expect(photoFileName('abc-123')).toBe('写真-abc-123.jpg')
    expect(photoIdFromFileName('写真-abc-123.jpg')).toBe('abc-123')
  })

  it('控えの写真でないファイルは、取りちがえない', () => {
    expect(photoIdFromFileName('IMG_0421.jpg')).toBeUndefined()
    expect(photoIdFromFileName('控え-2026-08-11.json')).toBeUndefined()
    expect(photoIdFromFileName('写真.jpg')).toBeUndefined()
  })

  it('受け取った写真は、元の id のまま端末に戻る', async () => {
    const files = [
      new File(['1枚目'], photoFileName('photo-1'), { type: 'image/jpeg' }),
      new File(['2枚目'], photoFileName('photo-2'), { type: 'image/jpeg' }),
    ]
    expect(await importPhotoFiles(files)).toBe(2)
    expect(await db.photos.count()).toBe(2)
    expect(await db.photos.get('photo-1')).toBeDefined()
  })

  it('関係のないファイルが混ざっていても、そこだけ飛ばす', async () => {
    const files = [
      new File(['写真'], photoFileName('photo-1'), { type: 'image/jpeg' }),
      new File(['よその画像'], 'IMG_0421.jpg', { type: 'image/jpeg' }),
    ]
    expect(await importPhotoFiles(files)).toBe(1)
    expect(await db.photos.count()).toBe(1)
  })

  it('写真をつけた費用が、控えを往復しても写真とつながったまま', async () => {
    await db.expenses.put({
      id: 'exp-1', createdAt: T1, updatedAt: T1,
      kind: 'repair', date: '2026-07-20', title: '給湯器の交換', amount: 128000,
      photoIds: ['photo-1'],
    })
    await db.photos.put({
      id: 'photo-1', createdAt: T1, updatedAt: T1,
      blob: new Blob(['見本の画像'], { type: 'image/jpeg' }),
      mime: 'image/jpeg', width: 1600, height: 1200,
    })

    const json = toJson(await createBackup())
    const sent = [new File([(await db.photos.get('photo-1'))!.blob], photoFileName('photo-1'), { type: 'image/jpeg' })]

    // 別の端末のつもりで、全部消してから受け取る
    await Promise.all(db.tables.map((t) => t.clear()))
    await importBackupJson(json)
    await importPhotoFiles(sent)

    const expense = await db.expenses.get('exp-1')
    expect(expense?.photoIds).toStrictEqual(['photo-1'])
    expect(await db.photos.get(expense!.photoIds[0])).toBeDefined()
  })
})

describe('古い形式の控え（固定ファイル）', () => {
  it('版1の控えが、いまでも読める', () => {
    const backup = parseBackup(BACKUP_V1_JSON)
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION)
    expect(backup.data.meta).toHaveLength(3)
    expect(backup.data.meta[0].key).toBe('checkCount')
  })

  it('版1に無かった表は、空になるだけで壊れない', () => {
    const backup = parseBackup(BACKUP_V1_JSON)
    expect(backup.data.rooms).toStrictEqual([])
    expect(backup.data.notes).toStrictEqual([])
    expect(backup.counts.rooms).toBe(0)
  })

  it('版1の控えを端末に書き戻せる', async () => {
    await importBackupJson(BACKUP_V1_JSON)
    expect(await db.meta.count()).toBe(3)
    expect((await db.meta.get('checkCount'))?.value).toBe('4')
  })
})

describe('おかしなファイルを読ませたとき', () => {
  it('JSONですらないものは、日本語で断る', () => {
    expect(() => parseBackup('これは控えではありません')).toThrow(/読み取れません/)
  })

  it('別のアプリのJSONは断る', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/控えではない/)
    expect(() => parseBackup('[1,2,3]')).toThrow(/控えではない/)
  })

  it('版が書かれていないものは断る', () => {
    expect(() => parseBackup(`{"format":"${BACKUP_FORMAT}","data":{}}`)).toThrow(/版の記載/)
  })

  it('いまより新しい版の控えは、上書きせずに断る', () => {
    const future = JSON.stringify({
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION + 1,
      data: {},
    })
    expect(() => parseBackup(future)).toThrow(/新しい版のアプリ/)
  })

  it('中身の欄が壊れているものは断る', () => {
    const broken = `{"format":"${BACKUP_FORMAT}","schemaVersion":${SCHEMA_VERSION},"data":[]}`
    expect(() => parseBackup(broken)).toThrow(/壊れている/)
  })

  it('断ったときに、端末のデータは1件も変わらない', async () => {
    await seed()
    const before = await readAll()
    await expect(importBackupJson('こわれたファイル')).rejects.toThrow()
    expect(await readAll()).toStrictEqual(before)
  })
})

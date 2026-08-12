// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  db, type Equipment, type Expense, type Lease, type Note, type Room, type Schedule, type Tenant,
} from '../db'
import { addNote, removeNote } from './contracts'
import { createEquipment, removeEquipment } from './equipment'
import { createExpense, removeExpense } from './expenses'
import { completeSchedule, createSchedule, removeSchedule } from './schedules'
import { buildTrash, restoreItem, type TrashInput } from './trash'

/**
 * 消したものを戻す、の試験
 *
 * 守りたいのは2つ。
 * 1. 消したものが**必ず全部**この画面に出ること（出なければ取り返しがつかない）
 * 2. 戻したものが、もとの一覧に**そのまま**帰ってくること（中身が変わらない）
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const room: Room = { ...base, id: 'r1', roomNo: '101', floor: 1, sortOrder: 1 }
const tenant: Tenant = { ...base, id: 't1', name: '田中 一郎', kana: 'タナカ イチロウ' }
const lease: Lease = {
  ...base, id: 'l1', roomId: 'r1', tenantId: 't1',
  startDate: '2024-04-01', endDate: '2026-03-31', deposit: 100000, keyMoney: 0,
}

function input(over: Partial<TrashInput> = {}): TrashInput {
  return {
    rooms: [room], tenants: [tenant], leases: [lease],
    expenses: [], schedules: [], equipment: [], notes: [], ...over,
  }
}

describe('buildTrash', () => {
  it('消していないものは出さない', () => {
    const e: Expense = {
      ...base, id: 'e1', kind: 'repair', date: '2026-01-05',
      title: 'エアコンの修理', amount: 33000, photoIds: [],
    }
    expect(buildTrash(input({ expenses: [e] }))).toEqual([])
  })

  it('消したものを、新しい順に並べる', () => {
    const e: Expense = {
      ...base, id: 'e1', kind: 'repair', date: '2026-01-05',
      title: 'エアコンの修理', amount: 33000, photoIds: [],
      deletedAt: '2026-02-01T00:00:00.000Z',
    }
    const s: Schedule = {
      ...base, id: 's1', title: '火災保険の更新', kind: 'insurance',
      nextDate: '2026-06-01', everyMonths: 12, noticeDays: 30,
      deletedAt: '2026-03-01T00:00:00.000Z',
    }
    const rows = buildTrash(input({ expenses: [e], schedules: [s] }))
    expect(rows.map((r) => r.what)).toEqual(['火災保険の更新', 'エアコンの修理'])
    expect(rows[0].where).toBe('⑤ 年間の予定')
    expect(rows[1].detail).toContain('¥33,000')
  })

  it('設備は、どの部屋のものかと設置年月を出す（同じ「その他」を見分けるため）', () => {
    const eq: Equipment = {
      ...base, id: 'q1', kind: 'other', name: '受水槽',
      installedOn: '2014-03', lifeYears: 10, deletedAt: T,
    }
    const [row] = buildTrash(input({ equipment: [eq] }))
    expect(row.what).toBe('建物全体 受水槽')
    expect(row.detail).toContain('2014')
  })

  it('メモは、誰の分かと本文の頭を出す', () => {
    const n: Note = {
      ...base, id: 'n1', targetType: 'lease', targetId: 'l1', date: '2026-01-05',
      author: '', body: '耳が遠いので、電話より手紙が確実。\n夜勤で日中は不在。',
      byVoice: false, deletedAt: T,
    }
    const [row] = buildTrash(input({ notes: [n] }))
    expect(row.what).toBe('101号室 田中 一郎 のいきさつメモ')
    expect(row.detail).toContain('耳が遠い')
    expect(row.to).toBe('/contracts/l1')
  })

  it('長いメモは途中で切る（一覧が読めなくなるため）', () => {
    const n: Note = {
      ...base, id: 'n1', targetType: 'lease', targetId: 'l1', date: '2026-01-05',
      author: '', body: 'あ'.repeat(200), byVoice: false, deletedAt: T,
    }
    const [row] = buildTrash(input({ notes: [n] }))
    expect(row.detail!.length).toBeLessThan(50)
    expect(row.detail!.endsWith('…')).toBe(true)
  })

  it('済ませた1回きりの予定は出さない（消したのではないため）', () => {
    const s: Schedule = {
      ...base, id: 's1', title: '屋根の点検', kind: 'inspection',
      nextDate: '2026-05-01', everyMonths: 0, noticeDays: 30,
      completedOn: '2026-05-02', deletedAt: T,
    }
    expect(buildTrash(input({ schedules: [s] }))).toEqual([])
  })

  it('契約に付いていないメモでも、行き先を必ず持つ（押して迷子にならない）', () => {
    const n: Note = {
      ...base, id: 'n1', targetType: 'room', targetId: 'r1', date: '2026-01-05',
      author: '', body: '雨どいの掃除', byVoice: false, deletedAt: T,
    }
    const [row] = buildTrash(input({ notes: [n] }))
    expect(row.to).toBe('/contracts')
  })
})

describe('戻す（実際の保存を通す）', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.rooms.put(room)
    await db.tenants.put(tenant)
    await db.leases.put(lease)
  })

  async function trashNow() {
    const [expenses, schedules, equipment, notes] = await Promise.all([
      db.expenses.toArray(), db.schedules.toArray(),
      db.equipment.toArray(), db.notes.toArray(),
    ])
    return buildTrash(input({ expenses, schedules, equipment, notes }))
  }

  it('③の費用: 消すと出てきて、戻すと消える', async () => {
    const id = await createExpense({
      kind: 'repair', date: '2026-01-05', title: 'エアコンの修理', amount: 33000, photoIds: [],
    })
    expect(await trashNow()).toEqual([])

    await removeExpense(id)
    const rows = await trashNow()
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('expense')

    await restoreItem('expense', id)
    expect(await trashNow()).toEqual([])
    const back = await db.expenses.get(id)
    expect(back?.deletedAt).toBeUndefined()
    // 中身は消す前のまま。戻したときに書き換わっては困る
    expect(back?.title).toBe('エアコンの修理')
    expect(back?.amount).toBe(33000)
  })

  it('⑤の予定: 消すと出てきて、戻すと消える', async () => {
    const id = await createSchedule({
      title: '火災保険の更新', kind: 'insurance',
      nextDate: '2026-06-01', everyMonths: 12, noticeDays: 30,
    })
    await removeSchedule(id)
    expect((await trashNow())[0].kind).toBe('schedule')

    await restoreItem('schedule', id)
    expect(await trashNow()).toEqual([])
    expect((await db.schedules.get(id))?.nextDate).toBe('2026-06-01')
  })

  it('⑥の設備: 戻しても設置年月ともつ年数が変わらない', async () => {
    const id = await createEquipment({
      kind: 'other', name: '受水槽', installedOn: '2014-03', lifeYears: 15,
    })
    await removeEquipment(id)
    await restoreItem('equipment', id)
    const back = await db.equipment.get(id)
    expect(back?.deletedAt).toBeUndefined()
    expect(back?.installedOn).toBe('2014-03')
    expect(back?.lifeYears).toBe(15)
    expect(back?.name).toBe('受水槽')
  })

  it('①のいきさつメモ: 戻すと本文がそのまま帰る', async () => {
    await addNote({
      targetType: 'lease', targetId: 'l1', date: '2026-01-05',
      body: '耳が遠いので、電話より手紙が確実。',
    })
    // addNote は id を返さないので、入ったものを引き当てる
    const id = (await db.notes.toArray())[0].id
    await removeNote(id)
    expect((await trashNow())[0].kind).toBe('note')

    await restoreItem('note', id)
    expect(await trashNow()).toEqual([])
    expect((await db.notes.get(id))?.body).toBe('耳が遠いので、電話より手紙が確実。')
  })

  it('1回きりの予定を済ませても、「消したもの」には出てこない', async () => {
    const id = await createSchedule({
      title: '屋根の点検', kind: 'inspection',
      nextDate: '2026-05-01', everyMonths: 0, noticeDays: 30,
    })
    await completeSchedule(id, { date: '2026-05-02' })

    const after = await db.schedules.get(id)
    expect(after?.deletedAt).toBeTruthy()
    expect(after?.completedOn).toBe('2026-05-02')
    expect(await trashNow()).toEqual([])
  })

  it('無い id を戻しても、何も起きない', async () => {
    await expect(restoreItem('expense', 'ない-id')).resolves.toBeUndefined()
  })

  it('もう戻したものを、もう一度戻しても壊れない', async () => {
    const id = await createExpense({
      kind: 'repair', date: '2026-01-05', title: '水漏れの修理', amount: 12000, photoIds: [],
    })
    await removeExpense(id)
    await restoreItem('expense', id)
    await restoreItem('expense', id)
    expect((await db.expenses.get(id))?.deletedAt).toBeUndefined()
  })
})

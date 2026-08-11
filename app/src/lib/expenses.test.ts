// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, type Expense, type Room } from '../db'
import {
  buildExpenseRows, createExpense, KIND_LABEL, previewOf, removeExpense,
  restoreExpense, totalOf, updateExpense, type ExpenseInput,
} from './expenses'

const T = '2026-08-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const room: Room = { id: 'r-103', ...base, roomNo: '103', floor: 1, sortOrder: 103 }

const INPUT: ExpenseInput = {
  kind: 'repair',
  date: '2026-07-18',
  title: '給湯器の交換',
  amount: 128000,
  vendor: '山田設備',
  roomId: room.id,
  photoIds: [],
  memo: 'お湯の出が悪いと言われていた。\n修理では直らないと業者に言われたので、退去のタイミングで新品に交換した。',
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.rooms.put(room)
})

describe('記録する', () => {
  it('入れたとおりに残る', async () => {
    const id = await createExpense(INPUT)
    const saved = await db.expenses.get(id)
    expect(saved?.title).toBe('給湯器の交換')
    expect(saved?.amount).toBe(128000)
    expect(saved?.kind).toBe('repair')
    expect(saved?.roomId).toBe('r-103')
  })

  it('建物全体（部屋を選ばない）でも記録できる', async () => {
    const id = await createExpense({ ...INPUT, kind: 'fixed', title: '火災保険', roomId: undefined })
    const saved = await db.expenses.get(id)
    expect('roomId' in saved!).toBe(false)
  })

  it('空の欄は持たせない（控えの中身が揺れないように）', async () => {
    const id = await createExpense({ ...INPUT, vendor: '  ', memo: '' })
    const saved = await db.expenses.get(id)
    expect('vendor' in saved!).toBe(false)
    expect('memo' in saved!).toBe(false)
  })

  it('書きかえられる', async () => {
    const id = await createExpense(INPUT)
    await updateExpense(id, { ...INPUT, amount: 132000, memo: '実際は132,000円だった' })
    const saved = await db.expenses.get(id)
    expect(saved?.amount).toBe(132000)
    expect(saved?.memo).toBe('実際は132,000円だった')
    expect(saved?.createdAt).toBe((await db.expenses.get(id))?.createdAt)
  })
})

describe('消す', () => {
  it('行は残り、消した印がつくだけ', async () => {
    const id = await createExpense(INPUT)
    await removeExpense(id)
    expect(await db.expenses.count()).toBe(1)
    expect((await db.expenses.get(id))?.deletedAt).toBeTruthy()
  })

  it('消したものは一覧に出ない', async () => {
    const id = await createExpense(INPUT)
    await removeExpense(id)
    const rows = buildExpenseRows({ expenses: await db.expenses.toArray(), rooms: [room] })
    expect(rows).toStrictEqual([])
  })

  it('消したのを取り消せる', async () => {
    const id = await createExpense(INPUT)
    await removeExpense(id)
    await restoreExpense(id)
    expect((await db.expenses.get(id))?.deletedAt).toBeUndefined()
  })
})

describe('一覧の組み立て', () => {
  const expense = (id: string, date: string, kind: 'repair' | 'fixed', amount: number, roomId?: string): Expense =>
    ({ id, ...base, kind, date, title: id, amount, photoIds: [], roomId })

  const expenses = [
    expense('a', '2026-07-18', 'repair', 128000, 'r-103'),
    expense('b', '2026-08-02', 'fixed', 43000),
    expense('c', '2026-06-01', 'repair', 12000, 'r-103'),
  ]

  it('新しい順に並ぶ', () => {
    const rows = buildExpenseRows({ expenses, rooms: [room] })
    expect(rows.map((r) => r.expense.id)).toStrictEqual(['b', 'a', 'c'])
  })

  it('種類でしぼれる', () => {
    expect(buildExpenseRows({ expenses, rooms: [room], kind: 'repair' }).map((r) => r.expense.id))
      .toStrictEqual(['a', 'c'])
    expect(buildExpenseRows({ expenses, rooms: [room], kind: 'fixed' }).map((r) => r.expense.id))
      .toStrictEqual(['b'])
  })

  it('部屋が入っていれば号室、無ければ建物全体', () => {
    const rows = buildExpenseRows({ expenses, rooms: [room] })
    expect(rows.map((r) => r.target)).toStrictEqual(['建物全体', '103号室', '103号室'])
  })

  it('しぼった一覧の合計が出る', () => {
    expect(totalOf(buildExpenseRows({ expenses, rooms: [room] }))).toBe(183000)
    expect(totalOf(buildExpenseRows({ expenses, rooms: [room], kind: 'repair' }))).toBe(140000)
    expect(totalOf([])).toBe(0)
  })

  it('同じ日なら、あとから入れたほうが上にくる', () => {
    const same = [
      { ...expense('x', '2026-08-02', 'repair', 1000), createdAt: '2026-08-02T01:00:00.000Z' },
      { ...expense('y', '2026-08-02', 'repair', 2000), createdAt: '2026-08-02T02:00:00.000Z' },
    ]
    expect(buildExpenseRows({ expenses: same, rooms: [] }).map((r) => r.expense.id))
      .toStrictEqual(['y', 'x'])
  })
})

describe('メモの1行目', () => {
  it('1行目だけを出す', () => {
    expect(previewOf('1行目\n2行目')).toBe('1行目')
  })

  it('長いときは切って「…」をつける', () => {
    expect(previewOf('あ'.repeat(40), 10)).toBe(`${'あ'.repeat(10)}…`)
  })

  it('空白だけの行は飛ばす', () => {
    expect(previewOf('\n  \n本文')).toBe('本文')
  })

  it('メモが無くても壊れない', () => {
    expect(previewOf(undefined)).toBe('')
    expect(previewOf('')).toBe('')
  })
})

describe('種類の呼び方', () => {
  it('画面には日本語で出す', () => {
    expect(KIND_LABEL.repair).toBe('修繕')
    expect(KIND_LABEL.fixed).toBe('固定費')
  })
})

import { compact, db, newId, now, type Expense, type ExpenseKind, type Room } from '../db'

/**
 * ③ 修繕・費用
 *
 * 金額よりも「なぜ、この対応をしたか」が主役の画面。
 * 給湯器を直さずに交換した理由や、保険を年払いにした理由は、
 * 領収書のどこにも書かれない。ここに残さなければ失われる。
 */

export const KIND_LABEL: Record<ExpenseKind, string> = {
  repair: '修繕',
  fixed: '固定費',
}

/** 一覧の絞りこみ */
export type KindFilter = 'all' | ExpenseKind

// --- 計算だけ -------------------------------------------------------------

export interface ExpenseRow {
  expense: Expense
  room?: Room
  /** '103号室' か '建物全体' */
  target: string
  /** メモの1行目（一覧に出す下書き） */
  preview: string
}

/** メモの1行目だけを、長すぎない形で取り出す */
export function previewOf(memo: string | undefined, max = 26): string {
  const first = (memo ?? '').split('\n').find((line) => line.trim()) ?? ''
  return first.length > max ? `${first.slice(0, max)}…` : first
}

export function buildExpenseRows({
  expenses, rooms, kind = 'all',
}: {
  expenses: Expense[]
  rooms: Room[]
  kind?: KindFilter
}): ExpenseRow[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return expenses
    .filter((e) => !e.deletedAt && (kind === 'all' || e.kind === kind))
    .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
    .map((expense) => {
      const room = expense.roomId ? roomById.get(expense.roomId) : undefined
      return {
        expense,
        room,
        target: room ? `${room.roomNo}号室` : '建物全体',
        preview: previewOf(expense.memo),
      }
    })
}

/** 一覧に出ているぶんの合計 */
export function totalOf(rows: ExpenseRow[]): number {
  return rows.reduce((sum, r) => sum + r.expense.amount, 0)
}

// --- データベースの読み書き -----------------------------------------------

export interface ExpenseInput {
  kind: ExpenseKind
  date: string
  title: string
  amount: number
  vendor?: string
  /** 建物全体なら入れない */
  roomId?: string
  photoIds: string[]
  memo?: string
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

function fieldsOf(input: ExpenseInput) {
  return {
    kind: input.kind,
    date: input.date,
    title: input.title.trim(),
    amount: input.amount,
    vendor: trimmed(input.vendor),
    roomId: trimmed(input.roomId),
    photoIds: input.photoIds,
    memo: trimmed(input.memo),
  }
}

export async function createExpense(input: ExpenseInput): Promise<string> {
  const at = now()
  const id = newId()
  await db.expenses.put(compact({ id, createdAt: at, updatedAt: at, ...fieldsOf(input) }))
  return id
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const before = await db.expenses.get(id)
  if (!before) throw new Error('その記録が見つかりませんでした。')
  await db.expenses.put(compact({ ...before, updatedAt: now(), ...fieldsOf(input) }))
}

/** 消す（行は残し、消した印をつけるだけ） */
export async function removeExpense(id: string): Promise<void> {
  const before = await db.expenses.get(id)
  if (!before) return
  const at = now()
  await db.expenses.put({ ...before, deletedAt: at, updatedAt: at })
}

/** 消したのを取り消す */
export async function restoreExpense(id: string): Promise<void> {
  const before = await db.expenses.get(id)
  if (!before) return
  const next = { ...before, updatedAt: now() }
  delete next.deletedAt
  await db.expenses.put(next)
}

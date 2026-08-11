import {
  compact, db, newId, now, type Schedule, type ScheduleKind,
} from '../db'
import { addMonths, daysUntil, today } from './date'
import { createExpense } from './expenses'

/**
 * ⑤ 年間の予定（保険の更新・税金の納期・点検）
 *
 * 毎月来る家賃は忘れない。忘れるのは、**年に1回や4回しか来ないもの**のほう。
 * 火災保険の更新を落とすと、その1年は無保険になる。
 * 固定資産税の納期を落とすと延滞金がつく。どちらも取り返しがつかない。
 *
 * 決めごと
 * - ここが持つのは「**次にいつ来るか**」だけ。済ませた実績は `expenses` に残す（二重に持たない）
 * - 済ませたら、**予定日を起点に**次回へ進める。済ませた日を起点にすると、
 *   毎年少しずつ後ろへずれていってしまう
 * - 何日前から知らせるかは**予定ごとに決める**。保険の更新は手配に時間が要るので早めに、
 *   税金の納期はその月に入ってからでよい
 */

export const KIND_LABEL: Record<ScheduleKind, string> = {
  insurance: '保険',
  tax: '税金',
  inspection: '点検',
  other: 'その他',
}

/** 何か月ごとかの言い方 */
export function everyText(everyMonths: number): string {
  if (everyMonths === 0) return '1回きり'
  if (everyMonths === 12) return '年1回'
  if (everyMonths === 6) return '年2回'
  if (everyMonths === 4) return '年3回'
  if (everyMonths === 3) return '年4回'
  if (everyMonths === 1) return '毎月'
  return `${everyMonths}か月ごと`
}

/** 登録するときに選べる、よくある予定 */
export const TEMPLATES: {
  title: string
  kind: ScheduleKind
  everyMonths: number
  noticeDays: number
}[] = [
  { title: '火災保険の更新', kind: 'insurance', everyMonths: 12, noticeDays: 60 },
  { title: '地震保険の更新', kind: 'insurance', everyMonths: 12, noticeDays: 60 },
  { title: '固定資産税の納付', kind: 'tax', everyMonths: 3, noticeDays: 30 },
  { title: '消防設備点検', kind: 'inspection', everyMonths: 6, noticeDays: 60 },
  { title: '貯水槽の清掃', kind: 'inspection', everyMonths: 12, noticeDays: 30 },
  { title: '草刈り・剪定', kind: 'other', everyMonths: 6, noticeDays: 30 },
]

// --- 計算だけ -------------------------------------------------------------

const alive = <T extends { deletedAt?: string }>(row: T) => !row.deletedAt

/** 知らせの強さ。過ぎている・1週間以内は赤、知らせる範囲に入ったら黄 */
export type NoticeLevel = 'red' | 'yellow' | 'none'

export interface ScheduleRow {
  schedule: Schedule
  /** あと何日か（過ぎていれば負の数） */
  days: number
  level: NoticeLevel
  /** 'あと12日' / '今日です' / '3日過ぎています' */
  text: string
}

export function levelOf(days: number, noticeDays: number): NoticeLevel {
  if (days <= 7) return 'red'
  if (days <= noticeDays) return 'yellow'
  return 'none'
}

export function noticeText(days: number): string {
  if (days < 0) return `${-days}日過ぎています`
  if (days === 0) return '今日です'
  return `あと${days}日`
}

/** 近い順に並べる。過ぎているものが先頭に来る */
export function buildScheduleRows(schedules: Schedule[], from: string = today()): ScheduleRow[] {
  return schedules
    .filter(alive)
    .map((schedule) => {
      const days = daysUntil(schedule.nextDate, from)
      return { schedule, days, level: levelOf(days, schedule.noticeDays), text: noticeText(days) }
    })
    .sort((a, b) => a.days - b.days)
}

/** ホームに出すぶん（知らせる範囲に入っているものだけ） */
export function needsAttention(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.filter((r) => r.level !== 'none')
}

/**
 * 済ませたあとの次回。
 *
 * 予定日を起点に進める。ただし、ずっと後になって記録した場合に
 * 次回が過去のままになってしまうので、済ませた日より後になるまで送る。
 */
export function nextDateAfter(
  nextDate: string, everyMonths: number, doneOn: string,
): string | undefined {
  if (everyMonths <= 0) return undefined
  let next = addMonths(nextDate, everyMonths)
  // 何年も放っておかれた場合の保険。回数を区切って、無限に回さない
  for (let guard = 0; next <= doneOn && guard < 200; guard++) {
    next = addMonths(next, everyMonths)
  }
  return next
}

// --- データベースの読み書き -----------------------------------------------

export interface ScheduleInput {
  title: string
  kind: ScheduleKind
  nextDate: string
  everyMonths: number
  noticeDays: number
  amount?: number
  vendor?: string
  memo?: string
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

function fieldsOf(input: ScheduleInput) {
  return {
    title: input.title.trim(),
    kind: input.kind,
    nextDate: input.nextDate,
    everyMonths: input.everyMonths,
    noticeDays: input.noticeDays,
    amount: input.amount,
    vendor: trimmed(input.vendor),
    memo: trimmed(input.memo),
  }
}

export async function createSchedule(input: ScheduleInput): Promise<string> {
  const at = now()
  const id = newId()
  await db.schedules.put(compact({ id, createdAt: at, updatedAt: at, ...fieldsOf(input) }))
  return id
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<void> {
  const before = await db.schedules.get(id)
  if (!before) throw new Error('その予定が見つかりませんでした。')
  await db.schedules.put(compact({ ...before, updatedAt: now(), ...fieldsOf(input) }))
}

/** 消す（行は残し、消した印をつけるだけ） */
export async function removeSchedule(id: string): Promise<void> {
  const before = await db.schedules.get(id)
  if (!before) return
  const at = now()
  await db.schedules.put({ ...before, deletedAt: at, updatedAt: at })
}

export interface CompleteResult {
  /** 次にすることの日。1回きりの予定なら入らない */
  nextDate?: string
  /** ③修繕・費用に作った記録の id。金額を入れなかったときは入らない */
  expenseId?: string
}

/**
 * 済ませたことにする。
 *
 * 金額を入れたときだけ、③修繕・費用に固定費として1件残す。
 * 「点検は管理会社もちで、こちらの出費は無い」ということがあるため、
 * 金額を入れないまま済ませられるようにしてある。
 */
export async function completeSchedule(
  id: string, done: { date: string; amount?: number },
): Promise<CompleteResult> {
  const result: CompleteResult = {}

  // 費用を残すことと、予定を進めることは**ひとまとまり**にする。
  // 別々にすると、費用を書いた直後に失敗したとき、③には記録が残ったまま
  // 予定は「まだ済んでいない」ことになる。次に開いたときも同じ予定が
  // 「過ぎています」と出ているので、もう一度押され、③に同じ費用が二重に入る。
  // 年ごとのまとめの支出が、そのぶん二重に膨らむ
  await db.transaction('rw', [db.schedules, db.expenses], async () => {
    const schedule = await db.schedules.get(id)
    if (!schedule) throw new Error('その予定が見つかりませんでした。')

    if (done.amount !== undefined && done.amount > 0) {
      result.expenseId = await createExpense({
        kind: 'fixed',
        date: done.date,
        title: schedule.title,
        amount: done.amount,
        vendor: schedule.vendor,
        memo: schedule.memo,
        photoIds: [],
      })
    }

    const nextDate = nextDateAfter(schedule.nextDate, schedule.everyMonths, done.date)
    const at = now()
    if (nextDate) {
      result.nextDate = nextDate
      await db.schedules.put({ ...schedule, nextDate, updatedAt: at })
    } else {
      // 1回きりの予定は、済ませたら一覧から消す
      await db.schedules.put({ ...schedule, deletedAt: at, updatedAt: at })
    }
  })

  return result
}

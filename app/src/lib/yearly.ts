import type { Expense, Lease, Payment, RentTerm, Room } from '../db'
import { today } from './date'
import { buildMonthRows, summarize, thisMonth } from './rent'

/**
 * 年ごとのまとめ（確定申告のときに使う）
 *
 * 計算だけの置き場。データベースには触らない。
 *
 * 毎年2月から3月に、1年ぶんの家賃と修繕費を数え直す作業がある。
 * 記録はもう全部この中にあるので、足し算をこちらでやってしまう。
 *
 * 決めごと（あとで蒸し返さないため、ここに書いておく）
 *
 * - 年は**1月から12月**で区切る。確定申告が暦年で行われるため
 * - 家賃は「**何月分か**」で数える。12月分が翌年1月に入っても、その年のものとして扱う。
 *   画面全体で「令和8年8月分の家賃」という言い方をしているので、それに合わせる
 * - 収入に数えるのは**実際に受け取った額**だけ。まだの分は「未収」として別に出す。
 *   受け取っていないお金を収入の欄に混ぜない
 * - **まだ来ていない月は未収に数えない**。8月に今年を開いたとき、9〜12月分が
 *   「まだ入っていない家賃」として並ぶと、滞納されているように読めてしまう
 * - **記録を付け始める前の月も未収に数えない**。年の途中からこのアプリを使い始めると、
 *   それ以前の月には入金の記録が1件も無い。これを未収として足すと
 *   「まだ入っていない家賃が300万円あります」と出てしまい、滞納だと読まれる。
 *   入金の記録がいちばん古い月より前は、**分からない**として黙る（無い数字を作らない）
 * - 礼金は収入に入れる。**敷金は入れない**（預かっているだけで、返すお金のため）。
 *   契約を更新すると敷金は次の契約に引き継がれる（`renewLease`）ので、
 *   仮に足すと更新のたびに二重に数えてしまう。数えないほうが正しく、かつ安全
 * - ここで出る数字は**目安**。最後は帳簿と突き合わせてもらう前提で作る
 */

const alive = <T extends { deletedAt?: string }>(row: T) => !row.deletedAt

/**
 * その月をどう扱うか
 *
 * - `before` … 入金を付け始めるより前。記録が無いだけなので、未収に数えない
 * - `done`   … 数える月
 * - `future` … まだ来ていない月
 */
export type MonthState = 'before' | 'done' | 'future'

/** 1か月ぶんの数字 */
export interface MonthTotal {
  /** 'YYYY-MM' */
  month: string
  /** 1〜12 */
  no: number
  /** 受け取った家賃・管理費 */
  received: number
  /** まだ受け取っていない額（`done` の月だけ） */
  unpaid: number
  /** まだの部屋数（`done` の月だけ） */
  unpaidRooms: number
  repair: number
  fixed: number
  state: MonthState
}

/** 1年ぶんのまとめ */
export interface YearSummary {
  year: number
  /** 1月から12月まで、必ず12行。記録の無い月も空で出す（抜けを見つけやすくするため） */
  months: MonthTotal[]
  /** 受け取った家賃・管理費 */
  rentReceived: number
  /** まだ受け取っていない家賃 */
  rentUnpaid: number
  /** まだ受け取っていない月の数 */
  unpaidCount: number
  /** 入金を付け始めるより前だった月の数（0でなければ、その旨を画面に出す） */
  beforeCount: number
  /** 礼金（その年に始まった契約のぶん） */
  keyMoney: number
  /** 入ったお金の合計 */
  income: number
  repair: number
  fixed: number
  /** 出ていったお金の合計 */
  expense: number
  /** 差引（入った − 出ていった） */
  net: number
  /** 記録が1件も無い年か（案内の文を変えるため） */
  empty: boolean
}

export interface YearInput {
  year: number
  rooms: Room[]
  leases: Lease[]
  rentTerms: RentTerm[]
  payments: Payment[]
  expenses: Expense[]
  /** どこまでを「もう来た月」とするか。既定は今月 */
  upTo?: string
  /**
   * どこから記録を付け始めたか（'YYYY-MM'）。
   * 既定は**入金の記録がいちばん古い月**。1件も無ければ、まだ付け始めていないものとして扱う
   */
  from?: string
}

/** 'YYYY-MM' を作る */
function monthOfYear(year: number, no: number): string {
  return `${year}-${String(no).padStart(2, '0')}`
}

function sumAmount(rows: { amount: number }[]): number {
  return rows.reduce((total, row) => total + row.amount, 0)
}

/** 入金の記録がいちばん古い月。1件も無ければ undefined */
export function firstRecordedMonth(payments: Payment[]): string | undefined {
  return payments
    .filter(alive)
    .map((p) => p.month)
    .sort()[0]
}

export function buildYear({
  year, rooms, leases, rentTerms, payments, expenses, upTo, from,
}: YearInput): YearSummary {
  const limit = upTo ?? thisMonth()
  const start = from ?? firstRecordedMonth(payments)
  const livingExpenses = expenses.filter(alive)

  const months: MonthTotal[] = []
  for (let no = 1; no <= 12; no++) {
    const month = monthOfYear(year, no)
    const state: MonthState =
      start === undefined || month < start ? 'before' : month > limit ? 'future' : 'done'

    // 家賃は②の画面と同じ組み立てを通す。数え方が2つあると、必ずどちらかがずれる
    const rows = buildMonthRows({ month, rooms, leases, tenants: [], rentTerms, payments })
    const money = summarize(rows)

    const ofMonth = livingExpenses.filter((e) => e.date.slice(0, 7) === month)
    months.push({
      month,
      no,
      received: money.received,
      unpaid: state === 'done' ? money.unpaid.reduce((total, r) => total + r.due, 0) : 0,
      unpaidRooms: state === 'done' ? money.unpaid.length : 0,
      repair: sumAmount(ofMonth.filter((e) => e.kind === 'repair')),
      fixed: sumAmount(ofMonth.filter((e) => e.kind === 'fixed')),
      state,
    })
  }

  const total = (pick: (m: MonthTotal) => number) =>
    months.reduce((sum, m) => sum + pick(m), 0)

  const rentReceived = total((m) => m.received)
  const rentUnpaid = total((m) => m.unpaid)
  const repair = total((m) => m.repair)
  const fixed = total((m) => m.fixed)

  // 礼金は、その年に**始まった**契約のもの。更新でできた契約は keyMoney が 0 なので混ざらない
  const keyMoney = leases
    .filter((l) => alive(l) && l.startDate.slice(0, 4) === String(year))
    .reduce((sum, l) => sum + l.keyMoney, 0)

  const income = rentReceived + keyMoney
  const expense = repair + fixed

  return {
    year,
    months,
    rentReceived,
    rentUnpaid,
    unpaidCount: months.filter((m) => m.unpaidRooms > 0).length,
    beforeCount: months.filter((m) => m.state === 'before').length,
    keyMoney,
    income,
    repair,
    fixed,
    expense,
    net: income - expense,
    empty: income === 0 && expense === 0 && rentUnpaid === 0,
  }
}

/**
 * 年送りで行き来できる年の一覧（新しい順）。
 *
 * 記録のある年に、今年を必ず足す。
 * 「まだ何も無い年」を延々とめくれてしまうと、壊れているように見えるため、
 * 記録のある範囲だけに閉じる。
 */
export function availableYears({
  leases, payments, expenses, now = today(),
}: {
  leases: Lease[]
  payments: Payment[]
  expenses: Expense[]
  now?: string
}): number[] {
  const found: number[] = [Number(now.slice(0, 4))]
  for (const l of leases.filter(alive)) found.push(Number(l.startDate.slice(0, 4)))
  for (const p of payments.filter(alive)) found.push(Number(p.month.slice(0, 4)))
  for (const e of expenses.filter(alive)) found.push(Number(e.date.slice(0, 4)))

  // 途中の年が抜けていると、年送りが飛んで壊れたように見える。端から端まで続けて並べる
  const from = Math.min(...found)
  const to = Math.max(...found)
  const years: number[] = []
  for (let y = to; y >= from; y--) years.push(y)
  return years
}

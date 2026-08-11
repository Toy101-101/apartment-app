/**
 * 日付と金額の共通処理
 *
 * 日付は必ず 'YYYY-MM-DD' の文字列で持つ。
 * new Date('2026-08-25') はUTCとして解釈され、日本時間では前日になってしまうため、
 * 必ず年月日に分解して組み立てる（mockup.html で検証済みの方法）。
 */

const WEEK = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 'YYYY-MM-DD' → Date（その日の0時0分。時差でずれない） */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date → 'YYYY-MM-DD' */
export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 今日（時刻は切り落とす。残さないと日数の計算が±1日ずれる） */
export function today(now: Date = new Date()): string {
  return toISO(now)
}

/**
 * 'YYYY-MM-DD' として**本当にある日**か。
 *
 * 形だけ見て通すと、`type="date"` が使えない端末で手打ちされた
 * '2026-02-31' や '2026-13-01' がそのまま保存される。
 * JavaScript はこれを3月3日・翌年1月に繰り上げてしまうので、
 * 画面に出る日付と、控えや集計に入る文字がずれる。
 * 組み立て直して同じ文字にもどるかで確かめる。
 */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return toISO(parseDate(iso)) === iso
}

/** 'YYYY-MM' として本当にある年月か（設備の設置年月に使う） */
export function isRealMonth(iso: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(iso)) return false
  const month = Number(iso.slice(5))
  return month >= 1 && month <= 12
}

/** その日の n日後（前なら負の数）。'2026-08-25' → n=1 → '2026-08-26' */
export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/**
 * その日の nか月後（前なら負の数）。
 *
 * 月末を必ずその月の月末に丸める。
 * 8月31日の6か月後を素直に計算すると「2月31日」になり、
 * JavaScript はこれを3月3日に繰り上げてしまう。
 * 固定資産税のように月末が納期のものが、毎回3日ずつずれていく。
 */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1 + n, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, lastDay))
  return toISO(target)
}

/** その日まであと何日か（過去なら負の数） */
export function daysUntil(iso: string, from: string = today()): number {
  const diff = parseDate(iso).getTime() - parseDate(from).getTime()
  return Math.round(diff / 86_400_000)
}

/**
 * 和暦の年に直す。令和は2019年5月1日から。
 * それ以前は西暦のまま返す（この物件は昭和からあるため、平成の日付も入りうる）
 */
function reiwaYear(date: Date): number | null {
  const y = date.getFullYear()
  if (y > 2019) return y - 2018
  if (y === 2019) {
    // 2019年5月1日より前は平成
    const boundary = new Date(2019, 4, 1)
    return date >= boundary ? 1 : null
  }
  return null
}

/** '2026-08-10' → '令和8年8月10日（月）' */
export function formatDate(iso: string): string {
  const d = parseDate(iso)
  const era = reiwaYear(d)
  const year = era === null ? `${d.getFullYear()}年` : `令和${era}年`
  return `${year}${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`
}

/** '2026-08-10' → '8月10日' （一覧など、年が自明な場所で使う） */
export function formatShort(iso: string): string {
  const d = parseDate(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** Date → 'YYYY-MM' */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 2026 → '令和8年'（令和より前は '2018年' のように西暦のまま） */
export function formatYear(year: number): string {
  const era = reiwaYear(new Date(year, 0, 1))
  return era === null ? `${year}年` : `令和${era}年`
}

/** '2026-08' → '令和8年8月分' */
export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const era = reiwaYear(new Date(y, m - 1, 1))
  const year = era === null ? `${y}年` : `令和${era}年`
  return `${year}${m}月分`
}

/** '2026-08' の1か月前後を返す */
export function shiftMonth(key: string, diff: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + diff, 1))
}

/** 12345 → '¥12,345'（円のみ。小数は扱わない） */
export function yen(amount: number): string {
  return '¥' + Math.round(amount).toLocaleString('ja-JP')
}

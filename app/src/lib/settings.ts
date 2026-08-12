import { db, getMeta, setMeta } from '../db'
import { DEFAULT_RENEWAL_NOTICE_DAYS } from './rent'

/**
 * 設定
 *
 * 建物ぜんぶに1つずつ。契約ごと・部屋ごとには持たない。
 * 決める場所が何か所もあると、「どこで変えたのか分からない」が必ず起きるため。
 *
 * 置き場は `meta` 表（key と value の1行1項目）。
 * このために新しい表を作らないので、`db.ts` の版を上げなくてよい。
 * `meta` はもともと控えに入っているので、**控えを読み込めば設定も一緒にもどる**。
 *
 * 値は文字として入るので、読むときに必ず確かめる。
 * 中身が壊れていたり、知らない値が入っていたら、黙って既定値に戻す
 * （設定ひとつのために画面が開かなくなるほうが困る）。
 */

/** 契約更新を何日前から知らせるか */
export const RENEWAL_NOTICE_KEY = 'renewalNoticeDays'

/** 選べる日数。増やすときは、ここと画面の両方に足す */
export const RENEWAL_NOTICE_CHOICES = [30, 60, 90] as const

/**
 * 既定は60日前（v1からの動き。設定を触らなければ、これまでと同じ）。
 *
 * 数字そのものは `rent.ts` が持っている。`renewalLevel` の「省略したとき」と
 * ここが別々に 60 と書いてあると、片方だけ変えたときに食いちがうため。
 */
export { DEFAULT_RENEWAL_NOTICE_DAYS }

export interface Settings {
  renewalNoticeDays: number
}

export const DEFAULT_SETTINGS: Settings = {
  renewalNoticeDays: DEFAULT_RENEWAL_NOTICE_DAYS,
}

/** 文字で入っている値を、選べる日数のどれかに落とす。合わなければ既定値 */
export function parseRenewalNoticeDays(value: string | undefined): number {
  const days = Number(value)
  return (RENEWAL_NOTICE_CHOICES as readonly number[]).includes(days)
    ? days
    : DEFAULT_RENEWAL_NOTICE_DAYS
}

export async function readSettings(): Promise<Settings> {
  return {
    renewalNoticeDays: parseRenewalNoticeDays(await getMeta(RENEWAL_NOTICE_KEY)),
  }
}

/**
 * 画面の外（ホームや一覧）から、その都度読むためのもの。
 * `useLiveQuery` の中で使えるよう、`meta` 表を直に読む形にしてある。
 */
export async function readRenewalNoticeDays(): Promise<number> {
  return parseRenewalNoticeDays((await db.meta.get(RENEWAL_NOTICE_KEY))?.value)
}

export async function saveRenewalNoticeDays(days: number): Promise<void> {
  await setMeta(RENEWAL_NOTICE_KEY, String(parseRenewalNoticeDays(String(days))))
}

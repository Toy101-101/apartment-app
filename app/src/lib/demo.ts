/**
 * 見本モード（URLに `?demo=1` が付いているとき）
 *
 * 目的は「**本物の記録に一切触れずに**、中身の入った画面を見せる」こと。
 * 家族に見せるとき、実機で操作を確かめるときに使う。
 *
 * いちばん大事なところ ―― **保存場所（データベース）の名前ごと分ける**。
 *
 * GitHub Pages は本物も見本も同じ住所（`toy101-101.github.io`）に置かれる。
 * ブラウザの保存場所は住所ごとに1つなので、置き場所を分ける工夫をしないと
 * 両方が同じ引き出しを使ってしまう。見本を入れる処理（`loadSample`）は
 * **いまの中身を消してから入れる**ので、そのままでは本物の記録が消える。
 *
 * 名前を分けておけば、同じスマホで両方を開いても決して混ざらない。
 * 見本を見たあとに何をしても、本物のほうは無傷で残る。
 */

/** 本物の記録の置き場 */
export const REAL_DB = 'apartment'

/** 見本の置き場。本物とは別の引き出しになる */
export const DEMO_DB = 'apartment-demo'

/** `?demo=1` が付いているか */
export function demoFrom(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1'
}

/**
 * いま見本モードか。
 *
 * 読むのは画面を作る前の一度きり。あとから切りかわると、
 * 開いたままのデータベースと食いちがってしまう。
 * 試験（node）には `location` が無いので、そのときは必ず本物あつかいにする。
 */
export const IS_DEMO = typeof location !== 'undefined' && demoFrom(location.search)

/** いま使う保存場所の名前 */
export const DB_NAME = IS_DEMO ? DEMO_DB : REAL_DB

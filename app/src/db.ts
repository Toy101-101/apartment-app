import Dexie, { type Table } from 'dexie'

/**
 * 端末の中のデータベース（IndexedDB）
 *
 * ここに入れたものは、この端末のブラウザの中だけに残る。
 * サーバーには一切送らない。だからこそ「控えを家族に送る」機能が要になる。
 */

/** 設定や覚え書き（1行1項目） */
export interface MetaRow {
  key: string
  value: string
  updatedAt: string
}

export class AppDB extends Dexie {
  meta!: Table<MetaRow, string>

  constructor() {
    super('apartment')
    // 以降、表を足すときは version(2), version(3)... と増やしていく（既存データは消さない）
    this.version(1).stores({
      meta: '&key',
    })
  }
}

export const db = new AppDB()

/** データの形の版。控えJSONにも必ず書き込む */
export const SCHEMA_VERSION = 1

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value, updatedAt: new Date().toISOString() })
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

import Dexie, { type Table } from 'dexie'

/**
 * 端末の中のデータベース（IndexedDB）
 *
 * ここに入れたものは、この端末のブラウザの中だけに残る。
 * サーバーには一切送らない。だからこそ「控えを家族に送る」機能が要になる。
 *
 * 設計の約束（PLAN.md「データ設計」より）
 * - 部屋番号を鍵にしない。入居者が変わった瞬間に過去の記録が読めなくなるため、
 *   すべての行は `id`（crypto.randomUUID）で結ぶ
 * - 日付は必ず 'YYYY-MM-DD' の文字列。年月は 'YYYY-MM'
 * - 金額は整数の円のみ（小数を持たない）
 * - 上書きせず履歴として残す: 家賃の変更（rentTerms）／契約の更新（leases を足す）／
 *   退去と再入居（status を書き換えず、契約を終わらせて新しい契約を作る）
 * - 消すときは行を削らず `deletedAt` を入れる（論理削除）
 */

/** すべての行が持つ共通の欄 */
export interface BaseRow {
  id: string
  createdAt: string // ISO日時（'2026-08-10T12:34:56.789Z'）
  updatedAt: string
  /** 論理削除。入っていたら「消したもの」として画面には出さない */
  deletedAt?: string
}

/** 設定や覚え書き（1行1項目） */
export interface MetaRow {
  key: string
  value: string
  updatedAt: string
}

/** 部屋。番号は変わりうる情報として持ち、鍵には使わない */
export interface Room extends BaseRow {
  roomNo: string // '101'
  floor: number
  /** 一覧に並べる順（部屋番号の文字列順だと 101, 102, 201 が崩れることがある） */
  sortOrder: number
  memo?: string
}

/** 人（入居者） */
export interface Tenant extends BaseRow {
  name: string
  kana: string
  phone?: string
  guarantorName?: string
  guarantorPhone?: string
  /**
   * 連絡のしかた。例：「耳が遠いので手紙が確実」「夜勤で日中は不在」
   * 契約書のどこにも書かれない、頭の中にしかない情報。引き継ぎで最初に失われる。
   */
  contactNote?: string
}

/** 契約。更新のたびに新しい行を足す（前の行は残す） */
export interface Lease extends BaseRow {
  roomId: string
  tenantId: string
  startDate: string // 'YYYY-MM-DD'
  endDate: string // 'YYYY-MM-DD'。更新の警告（60日・30日前）はこれで出す
  deposit: number // 敷金
  keyMoney: number // 礼金
  /** 退去した日。入っていれば endDate より前でも契約は終わっている */
  movedOutOn?: string
}

/** 家賃の履歴。「2022年の更新で2,000円下げた」という判断そのものを残す */
export interface RentTerm extends BaseRow {
  leaseId: string
  fromMonth: string // 'YYYY-MM' この月分から適用
  rent: number
  mgmtFee: number // 管理費
  reason?: string // 変更の理由
}

/** 入金の方法 */
export type PayMethod = 'transfer' | 'cash' | 'other' // 振込／手渡し／その他

/**
 * 入金。1つの契約 × 1つの対象年月 につき1行。
 * 「済／未」の2状態は paidOn で表す（入っていれば済、無ければ未）。
 */
export interface Payment extends BaseRow {
  leaseId: string
  month: string // 'YYYY-MM' 対象年月
  amount: number // 受け取った金額（家賃＋管理費とは限らない）
  paidOn?: string // 'YYYY-MM-DD' 入金日。無ければ「未」
  method?: PayMethod
  memo?: string
}

/** 入金が「済」かどうか */
export function isPaid(p: Payment): boolean {
  return !!p.paidOn
}

/** 入金の操作を、誰が・いつ・何を・どう変えたか記録する（取り消しの土台にもなる） */
export interface PaymentLogRow extends BaseRow {
  paymentId: string
  at: string // ISO日時
  who: string
  action: 'markPaid' | 'markUnpaid' | 'edit' | 'undo'
  before?: string // 変更前の中身（JSON文字列）
  after?: string
}

/** 費用の種別 */
export type ExpenseKind = 'repair' | 'fixed' // 修繕／固定費

/** 費用 */
export interface Expense extends BaseRow {
  kind: ExpenseKind
  date: string // 'YYYY-MM-DD'
  title: string
  amount: number
  vendor?: string // 業者
  roomId?: string // 建物全体の費用なら入れない
  photoIds: string[]
  memo?: string
}

/** 写真。Blob のまま持つ（控えJSONには入れない。base64 にすると1.33倍に膨らむ） */
export interface Photo extends BaseRow {
  blob: Blob
  mime: string
  width: number
  height: number
  caption?: string
}

/** メモを結びつける先 */
export type NoteTarget = 'room' | 'tenant' | 'lease' | 'payment' | 'expense'

/** いきさつメモ。このアプリの主役 */
export interface Note extends BaseRow {
  targetType: NoteTarget
  targetId: string
  date: string // 'YYYY-MM-DD'
  author: string
  body: string
  byVoice: boolean // 音声入力で書いたか
}

export class AppDB extends Dexie {
  meta!: Table<MetaRow, string>
  rooms!: Table<Room, string>
  tenants!: Table<Tenant, string>
  leases!: Table<Lease, string>
  rentTerms!: Table<RentTerm, string>
  payments!: Table<Payment, string>
  paymentLog!: Table<PaymentLogRow, string>
  expenses!: Table<Expense, string>
  photos!: Table<Photo, string>
  notes!: Table<Note, string>

  constructor() {
    super('apartment')
    // 以降、表を足すときは version(3), version(4)... と増やしていく（既存データは消さない）
    this.version(1).stores({
      meta: '&key',
    })
    // version(2): 本体の表を足す。meta は据え置きなので version(1) の中身はそのまま残る
    this.version(2).stores({
      meta: '&key',
      rooms: 'id, roomNo, sortOrder',
      tenants: 'id, kana',
      leases: 'id, roomId, tenantId, endDate',
      rentTerms: 'id, leaseId, [leaseId+fromMonth]',
      payments: 'id, leaseId, month, [leaseId+month]',
      paymentLog: 'id, paymentId, at',
      expenses: 'id, kind, date, roomId',
      photos: 'id, createdAt',
      notes: 'id, targetType, date, [targetType+targetId]',
    })
  }
}

export const db = new AppDB()

/**
 * データの形の版。控えJSONにも必ず書き込む。
 * Dexie の version() と同じ数字にそろえておく（ずれると原因を追いにくくなる）。
 */
export const SCHEMA_VERSION = 2

/** 新しい行の id */
export function newId(): string {
  return crypto.randomUUID()
}

/**
 * 中身の無い欄を、鍵ごと落とす。
 *
 * `{ phone: undefined }` のまま保存すると、控えJSONにしたときだけ鍵が消えるため、
 * 「書き出す → 読み込む」で中身がずれてしまう。入れないなら最初から持たせない。
 */
export function compact<T extends object>(row: T): T {
  const obj = row as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key]
  }
  return row
}

let lastNow = ''

/**
 * 作った時刻・直した時刻に入れる文字列。
 *
 * 同じミリ秒のうちに2回呼ばれても、必ず前より後の時刻を返す。
 * 時刻が並ぶと「どちらが先か」が決められなくなり、
 * 操作の履歴が入れかわって表示されてしまうため。
 */
export function now(): string {
  const iso = new Date().toISOString()
  lastNow = iso > lastNow ? iso : new Date(Date.parse(lastNow) + 1).toISOString()
  return lastNow
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value, updatedAt: now() })
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

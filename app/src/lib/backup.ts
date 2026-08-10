import {
  db,
  SCHEMA_VERSION,
  type Expense,
  type Lease,
  type MetaRow,
  type Note,
  type Payment,
  type PaymentLogRow,
  type RentTerm,
  type Room,
  type Tenant,
} from '../db'
import { today } from './date'

/**
 * 控えの書き出しと読み込み
 *
 * データは祖父のスマホの中（IndexedDB）にしか無い。
 * iOSはホーム画面のアイコンを消すと中のデータも一緒に消えるので、
 * 「控えを家族に送る」ことが唯一の保険になる。だから機能より先にこれを作る。
 *
 * 守ること
 * - 書き出すJSONには必ず `schemaVersion` を入れる。これが無いと、
 *   何年か後に形が変わったとき、古い控えを読む手がかりが無くなる
 * - 写真（Blob）はJSONに入れない。base64にすると1.33倍に膨らみ、LINEで送れなくなる。
 *   写真は別のファイルとしてまとめて渡す
 * - 読み込みは、古い版の控えを新しい形へ直してから入れる（migrate）
 */

/** 控えファイルの目印。他のJSONを間違って読み込まないため */
export const BACKUP_FORMAT = 'apartment-app-backup'

/** 控えに入れる表（photos は Blob なので入らない） */
export interface BackupData {
  meta: MetaRow[]
  rooms: Room[]
  tenants: Tenant[]
  leases: Lease[]
  rentTerms: RentTerm[]
  payments: Payment[]
  paymentLog: PaymentLogRow[]
  expenses: Expense[]
  notes: Note[]
}

/** 控えファイルの中身そのもの */
export interface Backup {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  /** 書き出した日時（ISO） */
  exportedAt: string
  /** 何件入っているか。開かなくても中身の量が分かるように先頭に置く */
  counts: Record<string, number>
  /** JSONに入れなかった写真の枚数。別に送る必要があることを伝えるため */
  photoCount: number
  data: BackupData
}

/** 空の表ひとそろい。毎回作り直す（使い回すと、片方への追加がもう片方に映ってしまう） */
function emptyTables(): BackupData {
  return {
    meta: [],
    rooms: [],
    tenants: [],
    leases: [],
    rentTerms: [],
    payments: [],
    paymentLog: [],
    expenses: [],
    notes: [],
  }
}

/** 控えに入れる表の名前（空の見本の鍵をそのまま使う。増やし忘れが起きない） */
export const BACKUP_TABLES = Object.keys(emptyTables()) as (keyof BackupData)[]

// --- 書き出し -------------------------------------------------------------

/** いま端末に入っているものを全部読み出す */
export async function readAll(): Promise<BackupData> {
  const [meta, rooms, tenants, leases, rentTerms, payments, paymentLog, expenses, notes] =
    await Promise.all([
      db.meta.toArray(),
      db.rooms.toArray(),
      db.tenants.toArray(),
      db.leases.toArray(),
      db.rentTerms.toArray(),
      db.payments.toArray(),
      db.paymentLog.toArray(),
      db.expenses.toArray(),
      db.notes.toArray(),
    ])
  return { meta, rooms, tenants, leases, rentTerms, payments, paymentLog, expenses, notes }
}

function countOf(data: BackupData): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of BACKUP_TABLES) counts[name] = data[name].length
  return counts
}

/** 控えを組み立てる */
export async function createBackup(at: Date = new Date()): Promise<Backup> {
  const data = await readAll()
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: at.toISOString(),
    counts: countOf(data),
    photoCount: await db.photos.count(),
    data,
  }
}

/** 控えを文字にする。人が開いても読めるように改行と字下げを入れる */
export function toJson(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

/** 控えファイルの名前。'控え-2026-08-10.json' */
export function backupFileName(day: string = today()): string {
  return `控え-${day}.json`
}

// --- 読み込み -------------------------------------------------------------

type RawData = Record<string, unknown>

/**
 * 版を1つ上げる手当て。
 * 「版1の控え」を「版2の形」に直す、というふうに1段ずつ書き足していく。
 * 一度書いたものは絶対に消さない（消すと、その版の古い控えが二度と読めなくなる）。
 */
const MIGRATIONS: Record<number, (data: RawData) => RawData> = {
  // 1 → 2: 本体の表（部屋・人・契約…）が増えた。
  // 版1の控えには meta しか入っていないので、残りは空の表として足す。
  1: (data) => ({ ...emptyTables(), meta: data.meta }),
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 足りない表を空で補い、余計な鍵を落として BackupData の形にそろえる */
function normalize(data: RawData): BackupData {
  const out = emptyTables() as unknown as Record<string, unknown[]>
  for (const name of BACKUP_TABLES) out[name] = asArray(data[name])
  return out as unknown as BackupData
}

/**
 * 控えの文字を読み取る。読めないときは、何が起きたか日本語で分かる文にして投げる。
 * （画面にそのまま出せる文にしておく）
 */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('このファイルは読み取れませんでした。控えのファイル（.json）を選んでください。')
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('このファイルは、アパート管理の控えではないようです。')
  }
  const obj = raw as Record<string, unknown>

  if (obj.format !== BACKUP_FORMAT) {
    throw new Error('このファイルは、アパート管理の控えではないようです。')
  }

  const version = obj.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('この控えには版の記載がなく、読み込めませんでした。')
  }
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `この控えは、いまより新しい版のアプリ（版${version}）で作られています。` +
        'アプリを新しくしてから読み込んでください。',
    )
  }

  const body = obj.data
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('この控えの中身が壊れているようです。')
  }
  let data = body as RawData

  // 古い版なら、いまの形になるまで1段ずつ直す
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(`この控え（版${v}）を、いまの形に直す方法がありません。`)
    data = step(data)
  }

  const normalized = normalize(data)
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    counts: countOf(normalized),
    photoCount: typeof obj.photoCount === 'number' ? obj.photoCount : 0,
    data: normalized,
  }
}

/**
 * 控えを端末に書き戻す。いまの中身は消えて、控えの中身に置き換わる。
 * 写真（photos）は控えJSONに入っていないため、消さずにそのまま残す。
 */
export async function restoreBackup(backup: Backup): Promise<Record<string, number>> {
  const { data } = backup
  const tables = [
    db.meta,
    db.rooms,
    db.tenants,
    db.leases,
    db.rentTerms,
    db.payments,
    db.paymentLog,
    db.expenses,
    db.notes,
  ]

  // 途中で失敗したら全部なかったことにする（半分だけ入った状態を作らない）
  await db.transaction('rw', tables, async () => {
    for (const table of tables) await table.clear()
    await db.meta.bulkPut(data.meta)
    await db.rooms.bulkPut(data.rooms)
    await db.tenants.bulkPut(data.tenants)
    await db.leases.bulkPut(data.leases)
    await db.rentTerms.bulkPut(data.rentTerms)
    await db.payments.bulkPut(data.payments)
    await db.paymentLog.bulkPut(data.paymentLog)
    await db.expenses.bulkPut(data.expenses)
    await db.notes.bulkPut(data.notes)
  })

  return countOf(data)
}

/** 読み込みの入口。文字を受け取って、確かめて、書き戻すまで */
export async function importBackupJson(text: string): Promise<Record<string, number>> {
  return restoreBackup(parseBackup(text))
}

// --- 端末に渡す（ブラウザでのみ動く） -------------------------------------

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * 控えを書き出して、家族に送るか端末に保存する。
 *
 * スマホでは共有シート（LINE・メールなど）を出す。
 * File System Access API は iOS Safari で動かないので使わない。
 * 共有に対応していないPCなどでは、そのままダウンロードに落とす。
 */
export async function shareBackup(): Promise<SaveResult> {
  const backup = await createBackup()
  const name = backupFileName()
  const file = new File([toJson(backup)], name, { type: 'application/json' })

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      // 本人が共有シートを閉じただけなら、失敗として騒がない
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // それ以外（共有に失敗した）はダウンロードで救う
    }
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // すぐ消すとダウンロードが始まらない端末があるため、少し待ってから解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

import {
  compact, db, newId, now,
  type Lease, type Note, type NoteTarget, type RentTerm, type Room, type Tenant,
} from '../db'
import { addDays, formatDate, today } from './date'
import { monthOf, renewalLevel, rentTermFor, type RenewalLevel } from './rent'

/**
 * ① 入居者・契約
 *
 * この画面のいちばん大事な決まりごとは「**上書きしない**」こと。
 * - 家賃を変える → rentTerms に行を足す（前の額と、下げた理由が残る）
 * - 契約を更新する → leases に行を足す（前の契約はそのまま残る）
 * - 退去する → 行を消さず movedOutOn を入れて終わらせる。再入居は新しい契約を作る
 *
 * 書きまちがいを直すときだけ、その行を書きかえる（updateContract）。
 * 前半は計算だけ、後半がデータベースの読み書き。
 */

// --- 計算だけ（画面に出す形を組み立てる） ---------------------------------

export interface ContractRow {
  lease: Lease
  room?: Room
  tenant?: Tenant
  /** 家賃＋管理費 */
  rent: number
  /** 今日の時点で契約が続いているか（これから始まる契約も含む） */
  living: boolean
  /** まだ始まっていない契約（更新して作った次の契約） */
  future: boolean
  level: RenewalLevel
  /** 更新まであと何日（過ぎていれば負の数） */
  days: number
}

export interface ContractListInput {
  leases: Lease[]
  rooms: Room[]
  tenants: Tenant[]
  rentTerms: RentTerm[]
  /** 'YYYY-MM-DD'。省略すると今日 */
  from?: string
  /** 更新を何日前から知らせるか（設定。省略すると60日前） */
  noticeDays?: number
}

/**
 * 契約の一覧を組み立てる。
 * 続いている契約を「更新が近い順」に並べ、終わった契約はそのあとに新しい順で置く。
 */
export function buildContractRows({
  leases, rooms, tenants, rentTerms, from = today(), noticeDays,
}: ContractListInput): ContractRow[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const month = monthOf(from)

  const rows = leases
    .filter((l) => !l.deletedAt)
    .map((lease): ContractRow => {
      // まだ始まっていない契約は「今月の家賃」が無いので、始まる月の額を出す。
      // そうしないと、更新して作った次の契約が ¥0 と表示されてしまう
      const startMonth = monthOf(lease.startDate)
      const term = rentTermFor(
        rentTerms.filter((t) => t.leaseId === lease.id),
        month < startMonth ? startMonth : month,
      )
      const end = lease.movedOutOn ?? lease.endDate
      const { level, days } = renewalLevel(lease.endDate, from, noticeDays)
      return {
        lease,
        room: roomById.get(lease.roomId),
        tenant: tenantById.get(lease.tenantId),
        rent: term ? term.rent + term.mgmtFee : 0,
        living: end >= from,
        future: lease.startDate > from,
        level,
        days,
      }
    })

  const living = rows.filter((r) => r.living)
    .sort((a, b) => a.lease.endDate.localeCompare(b.lease.endDate))
  const ended = rows.filter((r) => !r.living)
    .sort((a, b) => b.lease.endDate.localeCompare(a.lease.endDate))
  return [...living, ...ended]
}

/** 更新までを言葉にする（数字だけ出しても、急ぐのかどうかが分からない） */
export function renewalText(
  row: Pick<ContractRow, 'living' | 'future' | 'days' | 'lease'>,
): string {
  // 退去が決まっていれば、更新の話はもう関係ない
  if (row.lease.movedOutOn) {
    const day = formatDate(row.lease.movedOutOn)
    return row.living ? `${day}に退去されます` : `${day}に退去されました`
  }
  if (row.future) return `${formatDate(row.lease.startDate)}から始まります`
  if (!row.living) return '契約は終わっています'
  if (row.days < 0) return `更新の日を ${-row.days}日 過ぎています`
  if (row.days === 0) return '今日が更新の日です'
  return `あと${row.days}日で契約更新`
}

/**
 * 更新の知らせを出すべき契約（設定した日数まで近づいたもの。既定は60日前から）。
 * まだ始まっていない契約と、退去が決まっている契約は知らせない
 * （どちらも、これから更新することは無いため）。
 */
export function needsAttention(rows: ContractRow[]): ContractRow[] {
  return rows.filter((r) => r.living && !r.future && !r.lease.movedOutOn && r.level !== 'none')
}

// --- データベースの読み書き -----------------------------------------------

/** 登録・書きかえの入力。画面の欄がそのまま並んでいる */
export interface ContractInput {
  roomNo: string
  name: string
  kana: string
  phone?: string
  guarantorName?: string
  guarantorPhone?: string
  contactNote?: string
  startDate: string
  endDate: string
  deposit: number
  keyMoney: number
  rent: number
  mgmtFee: number
}

/** 入っていない欄は持たせない（undefined の鍵を残すと控えの中身が揺れる） */
function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

/**
 * 部屋番号から部屋を探す。無ければ作る。
 * 部屋だけを登録する画面は作らない（「103号室の契約を作る」と考えるのが自然なため）。
 */
async function findOrCreateRoom(roomNo: string): Promise<Room> {
  const found = (await db.rooms.where('roomNo').equals(roomNo).toArray()).find((r) => !r.deletedAt)
  if (found) return found

  const at = now()
  // '103' なら1階の3番目。数字が読めない部屋名でも登録はできるようにしておく
  const digits = Number(roomNo.replace(/[^0-9]/g, ''))
  const room: Room = {
    id: newId(), createdAt: at, updatedAt: at,
    roomNo,
    floor: Number.isFinite(digits) && digits >= 100 ? Math.floor(digits / 100) : 1,
    sortOrder: Number.isFinite(digits) ? digits : 9999,
  }
  await db.rooms.put(room)
  return room
}

function tenantFrom(input: ContractInput, id: string, createdAt: string, at: string): Tenant {
  return compact({
    id, createdAt, updatedAt: at,
    name: input.name.trim(),
    kana: input.kana.trim(),
    phone: trimmed(input.phone),
    guarantorName: trimmed(input.guarantorName),
    guarantorPhone: trimmed(input.guarantorPhone),
    contactNote: trimmed(input.contactNote),
  })
}

/** 新しい契約を登録する。部屋・入居者・契約・家賃をまとめて作る */
export async function createContract(input: ContractInput): Promise<string> {
  const at = now()
  const leaseId = newId()

  await db.transaction('rw', [db.rooms, db.tenants, db.leases, db.rentTerms], async () => {
    const room = await findOrCreateRoom(input.roomNo.trim())
    const tenant = tenantFrom(input, newId(), at, at)
    await db.tenants.put(tenant)

    await db.leases.put({
      id: leaseId, createdAt: at, updatedAt: at,
      roomId: room.id, tenantId: tenant.id,
      startDate: input.startDate, endDate: input.endDate,
      deposit: input.deposit, keyMoney: input.keyMoney,
    })
    await db.rentTerms.put({
      id: newId(), createdAt: at, updatedAt: at,
      leaseId, fromMonth: monthOf(input.startDate),
      rent: input.rent, mgmtFee: input.mgmtFee,
    })
  })

  return leaseId
}

/**
 * 書きまちがいを直す。
 * 家賃だけは、ここでは動かさない（下げた理由が消えてしまうため changeRent を使う）。
 */
export async function updateContract(leaseId: string, input: ContractInput): Promise<void> {
  const at = now()
  await db.transaction('rw', [db.rooms, db.tenants, db.leases], async () => {
    const lease = await db.leases.get(leaseId)
    if (!lease) throw new Error('その契約が見つかりませんでした。')

    const room = await findOrCreateRoom(input.roomNo.trim())
    const tenant = await db.tenants.get(lease.tenantId)
    await db.tenants.put(tenantFrom(input, lease.tenantId, tenant?.createdAt ?? at, at))

    await db.leases.put({
      ...lease, updatedAt: at,
      roomId: room.id,
      startDate: input.startDate, endDate: input.endDate,
      deposit: input.deposit, keyMoney: input.keyMoney,
    })
  })
}

/**
 * 家賃を変える。前の額は消さず、新しい行を足す。
 * 「2022年の更新で2,000円下げた」は祖父の判断そのものなので、理由まで残す。
 */
export async function changeRent(
  leaseId: string,
  change: { fromMonth: string; rent: number; mgmtFee: number; reason?: string },
): Promise<void> {
  const at = now()
  await db.rentTerms.put(compact({
    id: newId(), createdAt: at, updatedAt: at,
    leaseId,
    fromMonth: change.fromMonth,
    rent: change.rent,
    mgmtFee: change.mgmtFee,
    reason: trimmed(change.reason),
  }))
}

/**
 * 契約を更新する。いまの契約は残したまま、その翌日から始まる新しい契約を作る。
 * 家賃を据え置くならそのまま引き継ぐ。
 */
export async function renewLease(
  leaseId: string,
  renewal: { endDate: string; rent?: number; mgmtFee?: number; reason?: string },
): Promise<string> {
  const at = now()
  const newLeaseId = newId()

  await db.transaction('rw', [db.leases, db.rentTerms], async () => {
    const old = await db.leases.get(leaseId)
    if (!old) throw new Error('その契約が見つかりませんでした。')

    const startDate = addDays(old.endDate, 1)
    await db.leases.put({
      id: newLeaseId, createdAt: at, updatedAt: at,
      roomId: old.roomId, tenantId: old.tenantId,
      startDate, endDate: renewal.endDate,
      deposit: old.deposit, keyMoney: 0, // 更新のときに礼金は取らない
    })

    // 新しい契約にも家賃の行が要る（無いと金額が0円になってしまう）
    const terms = await db.rentTerms.where('leaseId').equals(leaseId).toArray()
    const current = rentTermFor(terms, monthOf(old.endDate))
    await db.rentTerms.put(compact({
      id: newId(), createdAt: at, updatedAt: at,
      leaseId: newLeaseId,
      fromMonth: monthOf(startDate),
      rent: renewal.rent ?? current?.rent ?? 0,
      mgmtFee: renewal.mgmtFee ?? current?.mgmtFee ?? 0,
      reason: trimmed(renewal.reason),
    }))
  })

  return newLeaseId
}

/** 退去。契約は消さず、そこで終わったことにする */
export async function endLease(leaseId: string, movedOutOn: string): Promise<void> {
  const lease = await db.leases.get(leaseId)
  if (!lease) throw new Error('その契約が見つかりませんでした。')
  await db.leases.put({ ...lease, movedOutOn, updatedAt: now() })
}

/** 退去を取り消す（間違って押したとき） */
export async function cancelEndLease(leaseId: string): Promise<void> {
  const lease = await db.leases.get(leaseId)
  if (!lease) throw new Error('その契約が見つかりませんでした。')
  const next = { ...lease, updatedAt: now() }
  delete next.movedOutOn
  await db.leases.put(next)
}

// --- いきさつメモ ---------------------------------------------------------

export async function addNote(note: {
  targetType: NoteTarget
  targetId: string
  body: string
  author?: string
  date?: string
  byVoice?: boolean
}): Promise<void> {
  const at = now()
  await db.notes.put({
    id: newId(), createdAt: at, updatedAt: at,
    targetType: note.targetType,
    targetId: note.targetId,
    date: note.date ?? today(),
    author: note.author?.trim() ?? '',
    body: note.body.trim(),
    byVoice: note.byVoice ?? false,
  })
}

/** メモを消す（行は残し、消した印をつけるだけ） */
export async function removeNote(noteId: string): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note) return
  await db.notes.put({ ...note, deletedAt: now(), updatedAt: now() })
}

/** 消したのを取り消す（「消したものを戻す」から呼ぶ） */
export async function restoreNote(noteId: string): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note) return
  const next = { ...note, updatedAt: now() }
  delete next.deletedAt
  await db.notes.put(next)
}

/** ある契約・部屋につくメモを、新しい順に返す */
export function sortNotes(notes: Note[]): Note[] {
  return notes
    .filter((n) => !n.deletedAt)
    .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

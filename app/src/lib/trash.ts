import type { Equipment, Expense, Lease, Note, Room, Schedule, Tenant } from '../db'
import { restoreNote } from './contracts'
import { formatDate, formatMonth, yen } from './date'
import { labelOf, restoreEquipment } from './equipment'
import { restoreExpense } from './expenses'
import { restoreSchedule } from './schedules'

/**
 * 消したものを戻す
 *
 * このアプリは消すときに行を削らない。`deletedAt` を入れて画面から隠すだけ
 * （`db.ts` の決めごと）。だが**戻す手立てが画面に無かった**ので、
 * 利用者から見れば押しまちがい1回で消滅していた。`ConfirmDelete` で
 * 2段階にはしたが、それは「消す前」の手当てで、消したあとの逃げ道ではない。
 *
 * 設備の年式のように「2014年に付けた」というもう思い出せない情報は、
 * 消えると作り直せない。ここが最後の受け皿になる。
 *
 * 決めごと
 * - **新しい表は作らない。** 消した行はもとの表にそのまま残っているので、
 *   `deletedAt` の入っている行を集めて並べ直すだけでよい（「最近の操作」と同じ考え方）
 * - **件数を区切らない。** 新しい順に並べるが、古いものも落とさない。
 *   ここで落とすと、その記録は本当に取り返しがつかなくなる
 * - **1回きりの予定を「済ませた」ものは出さない**（`completedOn`）。
 *   利用者が消したわけではないうえ、戻すと過ぎた日付のまま⑤にもどってきて、
 *   いつまでも期限切れとして居座る
 * - **ここに出るのは4種類だけ。** ①の契約と②の入金には、そもそも消す操作が無い
 *   （契約は「退去にする」で終わらせ、行は必ず残す）。
 *   探して見つからない人が出ないよう、そのことを画面に書いてある
 */

export type TrashKind = 'expense' | 'schedule' | 'equipment' | 'note'

export interface TrashEntry {
  kind: TrashKind
  id: string
  /** 消した時刻（ISO）。新しい順に並べるのに使う */
  at: string
  /** '③ 修繕・費用' のような、どの画面のものか */
  where: string
  /** 'エアコンの修理' */
  what: string
  /** 日付や金額など、同じ名前のものを見分けるための補足 */
  detail?: string
  /** 戻したあとに、それがどこで見られるか */
  to: string
}

export interface TrashInput {
  rooms: Room[]
  tenants: Tenant[]
  leases: Lease[]
  expenses: Expense[]
  schedules: Schedule[]
  equipment: Equipment[]
  notes: Note[]
}

/** メモの本文は長い。見分けがつくぶんだけ出す */
function excerpt(body: string, max = 40): string {
  const one = body.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

export function buildTrash(input: TrashInput): TrashEntry[] {
  const { rooms, tenants, leases, expenses, schedules, equipment, notes } = input

  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const leaseById = new Map(leases.map((l) => [l.id, l]))

  /** '101号室 田中 一郎' / 契約が見つからなければ空 */
  const whoOf = (leaseId: string): string => {
    const lease = leaseById.get(leaseId)
    if (!lease) return ''
    const roomNo = roomById.get(lease.roomId)?.roomNo
    const name = tenantById.get(lease.tenantId)?.name
    return [roomNo ? `${roomNo}号室` : '', name].filter(Boolean).join(' ')
  }

  const out: TrashEntry[] = []

  for (const e of expenses) {
    if (!e.deletedAt) continue
    out.push({
      kind: 'expense', id: e.id, at: e.deletedAt,
      where: '③ 修繕・費用',
      what: e.title || '（名前なし）',
      detail: `${formatDate(e.date)}・${yen(e.amount)}`,
      to: '/expenses',
    })
  }

  for (const s of schedules) {
    // 済ませて一覧から外れた1回きりの予定は、消したものではない
    if (!s.deletedAt || s.completedOn) continue
    out.push({
      kind: 'schedule', id: s.id, at: s.deletedAt,
      where: '⑤ 年間の予定',
      what: s.title || '（名前なし）',
      detail: `次は ${formatDate(s.nextDate)}`,
      to: '/schedules',
    })
  }

  for (const e of equipment) {
    if (!e.deletedAt) continue
    const target = e.roomId ? `${roomById.get(e.roomId)?.roomNo ?? '?'}号室` : '建物全体'
    out.push({
      kind: 'equipment', id: e.id, at: e.deletedAt,
      where: '⑥ 設備の年式',
      what: `${target} ${labelOf(e)}`,
      detail: `${formatMonth(e.installedOn)}に設置`,
      to: '/equipment',
    })
  }

  for (const n of notes) {
    if (!n.deletedAt) continue
    const who = n.targetType === 'lease' ? whoOf(n.targetId) : ''
    out.push({
      kind: 'note', id: n.id, at: n.deletedAt,
      where: '① いきさつメモ',
      what: who ? `${who} のいきさつメモ` : 'いきさつメモ',
      detail: excerpt(n.body),
      // 契約に付いていないメモは行き先が無いので、①の一覧に落とす
      to: n.targetType === 'lease' ? `/contracts/${n.targetId}` : '/contracts',
    })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * 1件もどす。
 *
 * 戻す処理そのものは、それぞれの表を持つ場所に置いてある
 * （消す処理の隣。片方だけ直されるのを防ぐため）。ここは振り分けるだけ。
 */
export async function restoreItem(kind: TrashKind, id: string): Promise<void> {
  switch (kind) {
    case 'expense': return restoreExpense(id)
    case 'schedule': return restoreSchedule(id)
    case 'equipment': return restoreEquipment(id)
    case 'note': return restoreNote(id)
  }
}


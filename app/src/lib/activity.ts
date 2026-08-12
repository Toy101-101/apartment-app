import type {
  Equipment, Expense, Lease, MoveOut, Note, Payment, RentTerm, Room, Schedule, Tenant,
} from '../db'
import { formatMonth } from './date'
import { labelOf } from './equipment'

/**
 * 最近の操作
 *
 * 「さっき何を触ったか」を1つの画面で見えるようにする。
 * 押しまちがいに気づくため、また、しばらく間が空いたときに
 * 「どこまでやったか」を思い出すための画面。
 *
 * 決めごと
 * - **新しい表は作らない。** どの行も `createdAt` / `updatedAt` / `deletedAt` を
 *   もともと持っているので、それを並べ直すだけで足りる。
 *   書き込みの口を10か所以上に足すやり方だと、**どこか1つ書き忘れても誰も気づかない**
 * - そのかわり、**分かるのは最後の1回だけ**。同じ行を3回直しても「直した」1件になる。
 *   日々の管理で効くのは「さっき何を触ったか」なので、これで足りると判断した
 * - **同じ時刻のものは、1つの操作としてまとめる。** `db.ts` の `now()` は
 *   ひとつの書き込みのなかで1回だけ呼んで使い回すので、
 *   同じ操作で書かれた行は時刻の文字列がそっくり同じになる。
 *   まとめないと、契約を1件登録しただけで入居者・契約・家賃の3行が並んでしまう
 * - **部屋と入居者は出さない。** それだけを作り直すことは無く、必ず契約の操作について回る。
 *   契約の行が同じことを言うので、二重になる
 */

export type ActivityAction = '作った' | '直した' | '消した'

export interface ActivityEntry {
  /** 並べ替えに使う時刻（ISO） */
  at: string
  action: ActivityAction
  /** '① 入居者・契約' のような、どの画面の話か */
  where: string
  /** '101号室 田中 一郎 の契約' */
  what: string
  /** 押したときに開く先。無ければ押せない行にする */
  to?: string
}

export interface ActivityInput {
  rooms: Room[]
  tenants: Tenant[]
  leases: Lease[]
  rentTerms: RentTerm[]
  payments: Payment[]
  expenses: Expense[]
  notes: Note[]
  schedules: Schedule[]
  equipment: Equipment[]
  moveOuts: MoveOut[]
  /** 何件まで出すか */
  limit?: number
}

/**
 * 同じ時刻に書かれた行が複数あるとき、どれで説明するか。
 * 数字が大きいほうを選ぶ。契約を作ると家賃の行も一緒にできるが、
 * 利用者がしたのは「契約を登録した」なので、契約のほうで言う。
 */
const PRIORITY = {
  lease: 90,
  moveOut: 80,
  equipment: 70,
  schedule: 60,
  expense: 50,
  payment: 40,
  rentTerm: 30,
  note: 20,
} as const

interface Candidate extends ActivityEntry {
  priority: number
}

function actionOf(row: { createdAt: string; updatedAt: string; deletedAt?: string }): ActivityAction {
  if (row.deletedAt) return '消した'
  return row.createdAt === row.updatedAt ? '作った' : '直した'
}

export function buildActivity(input: ActivityInput): ActivityEntry[] {
  const {
    rooms, tenants, leases, rentTerms, payments, expenses,
    notes, schedules, equipment, moveOuts, limit = 20,
  } = input

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

  const all: Candidate[] = []
  const add = (
    row: { createdAt: string; updatedAt: string; deletedAt?: string },
    priority: number, where: string, what: string, to?: string,
  ) => {
    all.push({ at: row.updatedAt, action: actionOf(row), priority, where, what, to })
  }

  for (const l of leases) {
    add(l, PRIORITY.lease, '① 入居者・契約',
      `${whoOf(l.id) || '（部屋なし）'} の契約`, `/contracts/${l.id}`)
  }
  for (const t of rentTerms) {
    add(t, PRIORITY.rentTerm, '① 家賃の変更',
      `${whoOf(t.leaseId) || '（契約なし）'} の家賃`, `/contracts/${t.leaseId}`)
  }
  for (const p of payments) {
    add(p, PRIORITY.payment, '② 家賃の入金',
      `${formatMonth(p.month)} ${whoOf(p.leaseId) || '（契約なし）'} の入金`, '/payments')
  }
  for (const e of expenses) {
    add(e, PRIORITY.expense, '③ 修繕・費用', e.title || '（名前なし）', `/expenses/${e.id}`)
  }
  for (const n of notes) {
    // メモは契約に付くものがほとんど。それ以外は行き先を出さない（押しても迷うだけ）
    const to = n.targetType === 'lease' ? `/contracts/${n.targetId}` : undefined
    const who = n.targetType === 'lease' ? whoOf(n.targetId) : ''
    add(n, PRIORITY.note, '① いきさつメモ', who ? `${who} のいきさつメモ` : 'いきさつメモ', to)
  }
  for (const s of schedules) {
    add(s, PRIORITY.schedule, '⑤ 年間の予定', s.title || '（名前なし）', '/schedules')
  }
  for (const e of equipment) {
    const target = e.roomId ? `${roomById.get(e.roomId)?.roomNo ?? '?'}号室` : '建物全体'
    add(e, PRIORITY.equipment, '⑥ 設備の年式', `${target} ${labelOf(e)}`, '/equipment')
  }
  for (const m of moveOuts) {
    add(m, PRIORITY.moveOut, '退去の手続き',
      `${whoOf(m.leaseId) || '（契約なし）'} の退去`, `/contracts/${m.leaseId}/moveout`)
  }

  // 同じ時刻＝ひとつの操作。いちばん強い行にまとめて言わせる
  const byTime = new Map<string, Candidate>()
  for (const c of all) {
    const found = byTime.get(c.at)
    if (!found || c.priority > found.priority) byTime.set(c.at, c)
  }

  return [...byTime.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map(({ priority: _priority, ...entry }) => entry)
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatMonth, formatShort, shiftMonth, yen } from '../lib/date'
import { togglePaid, undoToggle, type ToggleResult } from '../lib/payments'
import { buildMonthRows, summarize, thisMonth, type MonthRow } from '../lib/rent'
import s from './Payments.module.css'

/**
 * ② 家賃の入金
 *
 * 一番よく使う画面。押すのは「済／未」のボタンだけで済むようにする。
 * - 押しまちがえは5秒のあいだ取り消せる。取り消したことも履歴に残す
 * - 過去の月をひらくと、当時の家賃がそのまま出る（家賃を上書きしていないため）
 */

/** 何か月前まで遡れるか。「去年まで」＝12か月 */
const MONTHS_BACK = 12

const ACTION_LABEL: Record<string, string> = {
  markPaid: '「済」にした',
  markUnpaid: '「未」に戻した',
  undo: '取り消した',
  edit: '書きかえた',
}

/** ISO日時 → '8月11日 14:30' */
function formatAt(iso: string): string {
  const d = new Date(iso)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

export default function Payments() {
  const [month, setMonth] = useState(thisMonth())
  const [pending, setPending] = useState<ToggleResult | null>(null)

  // 取り消せるのは5秒だけ（それ以上残すと、何を取り消すのか分からなくなる）
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setPending(null), 5000)
    return () => clearTimeout(timer)
  }, [pending])

  const rows = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms, payments] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
      db.payments.where('month').equals(month).toArray(),
    ])
    return buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })
  }, [month])

  const history = useLiveQuery(async () => {
    const entries = await db.paymentLog.orderBy('at').reverse().limit(5).toArray()
    if (entries.length === 0) return []
    const [leases, rooms] = await Promise.all([db.leases.toArray(), db.rooms.toArray()])
    const roomNoOf = (leaseId: string) =>
      rooms.find((r) => r.id === leases.find((l) => l.id === leaseId)?.roomId)?.roomNo

    return entries.map((e) => {
      // 取り消しで行が消えていても読めるよう、控えてある中身から部屋を辿る
      const snapshot = e.after ?? e.before
      const leaseId = snapshot ? (JSON.parse(snapshot).leaseId as string) : ''
      return {
        id: e.id,
        at: formatAt(e.at),
        roomNo: roomNoOf(leaseId) ?? '—',
        what: ACTION_LABEL[e.action] ?? e.action,
      }
    })
  }, [])

  const current = thisMonth()
  const oldest = shiftMonth(current, -MONTHS_BACK)
  const summary = rows ? summarize(rows) : null

  async function handleToggle(row: MonthRow) {
    if (!row.lease) return
    setPending(
      await togglePaid({
        leaseId: row.lease.id,
        month,
        due: row.due,
        roomNo: row.room.roomNo,
      }),
    )
  }

  async function handleUndo() {
    if (!pending) return
    await undoToggle(pending)
    setPending(null)
  }

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <Link className={s.back} to="/" aria-label="ホームにもどる">
          ‹
        </Link>
        <div className={s.barTitle}>② 家賃の入金</div>
        <span className={s.backSpacer} aria-hidden="true" />
      </header>

      <main className={s.body}>
        <div className={s.monthBar}>
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            disabled={month <= oldest}
            aria-label="前の月"
          >
            ◀
          </button>
          <div className={s.monthLabel}>{formatMonth(month)}</div>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= current}
            aria-label="次の月"
          >
            ▶
          </button>
        </div>

        <p className={s.lead}>
          ボタンを1回押すだけで切りかえられます。
          押しまちがえても、もう一度押せば元に戻ります。
        </p>

        {rows === undefined && <p className={s.loading}>読み込んでいます…</p>}

        {rows?.length === 0 && (
          <p className={s.empty}>
            まだ部屋が登録されていません。
            ホームの下にある「見本データを入れる」を押すと、動きを試せます。
          </p>
        )}

        {rows?.map((row) => (
          <div key={row.room.id} className={`${s.row} ${row.lease ? '' : s.vacantRow}`}>
            <div className={s.who}>
              <div>
                <span className={`${s.roomNo} num`}>{row.room.roomNo}</span>
                <span className={s.name}>{row.tenant?.name ?? '空室のため なし'}</span>
              </div>
              {row.lease && (
                <div className={`${s.rent} num`}>
                  {yen(row.due)}
                  {row.paid && row.payment?.paidOn && (
                    <span className={s.paidOn}>／{formatShort(row.payment.paidOn)}に入金</span>
                  )}
                </div>
              )}
            </div>

            {row.lease ? (
              <button
                className={`${s.toggle} ${row.paid ? s.yes : s.no}`}
                onClick={() => handleToggle(row)}
                aria-pressed={row.paid}
              >
                {row.paid ? '✓ 済' : '✗ 未'}
              </button>
            ) : (
              <div className={s.vacantMark}>—</div>
            )}
          </div>
        ))}

        {summary && summary.occupied > 0 && (
          <section className={s.summary}>
            <div>
              入っているお金：<b className="num">{yen(summary.received)}</b>
              <span className={s.expected}>／{yen(summary.expected)}</span>
            </div>
            {summary.unpaid.length === 0 ? (
              <p className={s.allPaid}>◎ この月はすべて入金されています</p>
            ) : (
              <p className={s.someUnpaid}>
                まだの部屋：{summary.unpaid.length}件（
                {summary.unpaid.map((r) => `${r.room.roomNo}号室`).join('・')}）
              </p>
            )}
          </section>
        )}

        {history && history.length > 0 && (
          <section className={s.history}>
            <h2 className={s.historyTitle}>最近の操作</h2>
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <span className="num">{h.at}</span>
                  <span>
                    {h.roomNo}号室を{h.what}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link className={s.home} to="/">
          ホームにもどる
        </Link>
      </main>

      {/* 取り消しの帯。5秒たつと静かに消える */}
      {pending && (
        <div className={s.undoBar} role="status" aria-live="polite">
          <span>{pending.message}</span>
          <button onClick={handleUndo}>取り消す</button>
        </div>
      )}
    </div>
  )
}

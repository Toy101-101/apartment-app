import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatAt } from '../lib/date'
import { buildTrash, restoreItem, type TrashEntry } from '../lib/trash'
import s from './Trash.module.css'

/**
 * 消したものを戻す
 *
 * 消しても行は消えていない（`deletedAt` を入れて隠すだけ）のに、
 * **戻す手立てが画面に無かった**。利用者から見れば、押しまちがい1回で消滅する。
 * ここが最後の受け皿になる。
 *
 * 読むのは4つの表だけ（③費用・⑤予定・⑥設備・①メモ）。
 * 消す操作があるのはこの4つだけなので、ほかの表は読まない。
 *
 * 戻した行は**その場に残して「戻しました」に変える**。
 * 消えると、押した人が「本当に戻ったのか」を確かめられない。
 * また、断りや知らせは押したボタンのすぐそばに出す、という決まりにも合う。
 */
export default function Trash() {
  /** 戻したもの。この画面を開いているあいだだけ覚えておく */
  const [done, setDone] = useState<TrashEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const entries = useLiveQuery(async () => {
    const [rooms, tenants, leases, expenses, schedules, equipment, notes] = await Promise.all([
      db.rooms.toArray(),
      db.tenants.toArray(),
      db.leases.toArray(),
      db.expenses.toArray(),
      db.schedules.toArray(),
      db.equipment.toArray(),
      db.notes.toArray(),
    ])
    return buildTrash({ rooms, tenants, leases, expenses, schedules, equipment, notes })
  }, [])

  // 戻したものは一覧から外れるので、覚えておいたものを同じ場所に混ぜ直す
  const doneIds = new Set(done.map((d) => d.id))
  const rows = [...(entries ?? []).filter((e) => !doneIds.has(e.id)), ...done]
    .sort((a, b) => b.at.localeCompare(a.at))

  const restore = (entry: TrashEntry) => {
    setBusy(entry.id)
    void restoreItem(entry.kind, entry.id)
      .then(() => setDone((prev) => [...prev, entry]))
      .finally(() => setBusy(null))
  }

  return (
    <Screen title="消したものを戻す">
      {entries === undefined && <p className={s.note}>読み込んでいます…</p>}

      {entries?.length === 0 && done.length === 0 && (
        <p className={s.note}>
          消したものはありません。
          <br />
          記録を消しても、ここに残ります。あとから戻せます。
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p className={s.lead}>
            消したものは、この中に残っています。
            <b>「戻す」を押せば、もとの一覧にそのまま帰ります。</b>
          </p>

          <ul className={s.list}>
            {rows.map((e) => {
              const restored = doneIds.has(e.id)
              return (
                <li key={e.id} className={restored ? s.rowDone : s.row}>
                  <span className={s.at}>{formatAt(e.at)}に消しました</span>
                  <span className={s.what}>{e.what}</span>
                  {e.detail && <span className={s.detail}>{e.detail}</span>}
                  <span className={s.where}>{e.where}</span>

                  {restored ? (
                    <div className={s.doneBox}>
                      <p className={s.doneText}>戻しました</p>
                      <Link className={s.open} to={e.to}>
                        {e.where} をひらく
                      </Link>
                    </div>
                  ) : (
                    <button
                      className={s.restore}
                      disabled={busy !== null}
                      onClick={() => restore(e)}
                    >
                      {busy === e.id ? '戻しています…' : 'これを戻す'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/*
        探しても見つからない人が出ないよう、ここに出ないものを先に書いておく
      */}
      <p className={s.foot}>
        ここに出るのは、<b>③修繕・費用／⑤年間の予定／⑥設備の年式／①いきさつメモ</b> の4つです。
        ①の契約と②の家賃の入金には、そもそも消す操作がありません
        （契約は「退去にする」で終わらせ、記録は必ず残します）。
        <br />
        古いものも捨てずに残してあるので、何年前に消したものでも戻せます。
      </p>
    </Screen>
  )
}

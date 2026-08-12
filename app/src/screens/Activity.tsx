import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { buildActivity } from '../lib/activity'
import { formatAt } from '../lib/date'
import s from './Activity.module.css'

/**
 * 最近の操作
 *
 * 「さっき何を触ったか」を1か所で見る画面。
 * 押しまちがいに気づくため、また、しばらく間が空いたときに
 * 「どこまでやったか」を思い出すために置いてある。
 *
 * 記録そのものは持っていない。どの行にも入っている
 * 「作った時刻・直した時刻・消した印」を並べ直しているだけ（`lib/activity.ts`）。
 */
export default function Activity() {
  const entries = useLiveQuery(async () => {
    const [
      rooms, tenants, leases, rentTerms, payments, expenses, notes, schedules, equipment, moveOuts,
    ] = await Promise.all([
      db.rooms.toArray(),
      db.tenants.toArray(),
      db.leases.toArray(),
      db.rentTerms.toArray(),
      db.payments.toArray(),
      db.expenses.toArray(),
      db.notes.toArray(),
      db.schedules.toArray(),
      db.equipment.toArray(),
      db.moveOuts.toArray(),
    ])
    return buildActivity({
      rooms, tenants, leases, rentTerms, payments, expenses, notes, schedules, equipment, moveOuts,
    })
  }, [])

  return (
    <Screen title="最近の操作">
      {entries === undefined && <p className={s.note}>読み込んでいます…</p>}

      {entries?.length === 0 && (
        <p className={s.note}>
          まだ何も記録がありません。
          入居者や家賃の入金を登録すると、いつ何をしたかがここに並びます。
        </p>
      )}

      {entries && entries.length > 0 && (
        <ul className={s.list}>
          {entries.map((e) => {
            const body = (
              <>
                <span className={s.at}>{formatAt(e.at)}</span>
                <span className={s.what}>{e.what}</span>
                <span className={s.foot}>
                  <span className={s.where}>{e.where}</span>
                  <span className={e.action === '消した' ? s.removed : s.action}>
                    {e.action}
                  </span>
                </span>
              </>
            )
            return (
              <li key={e.at}>
                {e.to
                  ? <Link className={s.row} to={e.to}>{body}</Link>
                  : <div className={s.row}>{body}</div>}
              </li>
            )
          })}
        </ul>
      )}

      {/*
        できないことを先に書いておく。書いていないと
        「全部の履歴が残っているはず」と思われ、消えたものを探させてしまう
      */}
      <p className={s.lead}>
        新しいものから20件までを出しています。
        分かるのは<b>最後にしたこと1回だけ</b>で、同じところを何度も直したときは、
        いちばん新しい1件にまとまります。
        <br />
        消したものは「消した」と出ますが、この画面から元にもどすことはできません。
      </p>
    </Screen>
  )
}

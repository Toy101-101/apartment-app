import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildContractRows, needsAttention, renewalText } from '../lib/contracts'
import { formatDate, formatMonth, today, yen } from '../lib/date'
import { buildMonthRows, summarize, thisMonth } from '../lib/rent'
import { hasSampleData, removeSample } from '../lib/sample'
import { buildVacancyRows, countStates } from '../lib/vacancy'
import s from './Home.module.css'

/**
 * ホーム画面
 *
 * 開いてすぐ分かるべきは「今日、急いですることがあるか」だけ。
 * 出すのは2つ ―― 家賃の未入金と、更新が近い契約。
 * 何も無い日は「今日は、急いですることはありません」と言い切る（空白は「壊れた」と読まれる）。
 */
export default function Home() {
  const [busy, setBusy] = useState(false)
  const month = thisMonth()

  const view = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms, payments, expenses, sample] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
      db.payments.where('month').equals(month).toArray(),
      db.expenses.toArray(),
      hasSampleData(),
    ])
    return {
      money: summarize(buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })),
      renewals: needsAttention(buildContractRows({ leases, rooms, tenants, rentTerms })),
      expenses: expenses.filter((e) => !e.deletedAt).length,
      vacant: countStates(buildVacancyRows({ rooms, leases, tenants })).vacant,
      sample,
    }
  }, [month])

  const unpaid = view?.money.unpaid ?? []
  const renewals = view?.renewals ?? []
  const calm = view && unpaid.length === 0 && renewals.length === 0

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.barTitle}>アパート管理</div>
      </header>

      <main className={s.body}>
        <section className={`${s.notice} ${calm || !view ? '' : s.noticeWarn}`}>
          <p className={s.noticeHead}>{formatDate(today())}</p>

          {!view && <p className={s.noticeCalm}>読み込んでいます…</p>}
          {calm && <p className={s.noticeCalm}>今日は、急いですることはありません</p>}

          {unpaid.length > 0 && (
            <p className={s.noticeAlert}>
              {formatMonth(month)}の家賃が、{unpaid.length}件まだです
              <span className={s.noticeRooms}>
                （{unpaid.map((r) => `${r.room.roomNo}号室`).join('・')}）
              </span>
            </p>
          )}
          {unpaid.length > 0 && (
            <Link className={s.noticeBtn} to="/payments">
              家賃の入金をひらく
            </Link>
          )}

          {renewals.length > 0 && (
            <ul className={s.noticeList}>
              {renewals.map((r) => (
                <li key={r.lease.id}>
                  <Link to={`/contracts/${r.lease.id}`}>
                    {r.room?.roomNo}号室 {r.tenant?.name}
                    <span className={r.level === 'red' ? s.soonRed : s.soonYellow}>
                      {renewalText(r)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={s.grid}>
          <Link className={`${s.tile} ${s.t1}`} to="/contracts">
            <span className={s.tileNo}>①</span>
            <span>
              <span className={s.tileName}>入居者・契約</span>
              <span className={s.tileSub}>
                {view ? `${view.money.occupied}件` : '…'}
              </span>
            </span>
          </Link>
          <Link className={`${s.tile} ${s.t2}`} to="/payments">
            <span className={s.tileNo}>②</span>
            <span>
              <span className={s.tileName}>家賃の入金</span>
              <span className={s.tileSub}>
                {view
                  ? unpaid.length === 0
                    ? `今月ぶん ${yen(view.money.received)}`
                    : `まだ ${unpaid.length}件`
                  : '…'}
              </span>
            </span>
          </Link>
          <Link className={`${s.tile} ${s.t3}`} to="/expenses">
            <span className={s.tileNo}>③</span>
            <span>
              <span className={s.tileName}>修繕・費用</span>
              <span className={s.tileSub}>
                {view ? `${view.expenses}件` : '…'}
              </span>
            </span>
          </Link>
          <Link className={`${s.tile} ${s.t4}`} to="/vacancy">
            <span className={s.tileNo}>④</span>
            <span>
              <span className={s.tileName}>空室の状況</span>
              <span className={s.tileSub}>
                {view
                  ? view.vacant === 0
                    ? 'すべて入居中'
                    : `空室 ${view.vacant}室`
                  : '…'}
              </span>
            </span>
          </Link>
        </div>

        {/* 見本を入れた端末にだけ出る。消せば二度と出ない */}
        {view?.sample && (
          <section className={s.sample}>
            <h2 className={s.sampleTitle}>いま入っているのは見本です</h2>
            <p className={s.sampleNote}>
              動きを試すために入れた、架空の10部屋（田中一郎さんなど）が入っています。
              本物の入居者を登録する前に、こちらを消してください。
              本物の記録を登録したあとでも、消えるのは見本の10部屋だけです。
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void removeSample().finally(() => setBusy(false))
              }}
            >
              {busy ? '消しています…' : '見本の10部屋を消す'}
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

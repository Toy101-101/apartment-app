import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatDate, formatMonth, today, yen } from '../lib/date'
import { buildMonthRows, summarize, thisMonth } from '../lib/rent'
import { clearSample, loadSample } from '../lib/sample'
import s from './Home.module.css'

/**
 * ホーム画面
 *
 * 開いてすぐ分かるべきは「今日、急いですることがあるか」だけ。
 * いま出せるのは家賃の未入金のみ（契約更新の警告はフェーズ3で足す）。
 *
 * いちばん下の「作っている間だけの欄」は、入居者を登録する画面ができたら丸ごと消す。
 */
export default function Home() {
  const [busy, setBusy] = useState(false)
  const month = thisMonth()

  const summary = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms, payments] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
      db.payments.where('month').equals(month).toArray(),
    ])
    return summarize(buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments }))
  }, [month])

  const unpaid = summary?.unpaid ?? []

  async function handleSample(load: boolean) {
    setBusy(true)
    try {
      await (load ? loadSample() : clearSample())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.barTitle}>アパート管理</div>
      </header>

      <main className={s.body}>
        <section className={`${s.notice} ${unpaid.length ? s.noticeWarn : ''}`}>
          <p className={s.noticeHead}>{formatDate(today())}</p>
          {unpaid.length === 0 ? (
            <p className={s.noticeCalm}>今日は、急いですることはありません</p>
          ) : (
            <>
              <p className={s.noticeAlert}>
                {formatMonth(month)}の家賃が、{unpaid.length}件まだです
                <span className={s.noticeRooms}>
                  （{unpaid.map((r) => `${r.room.roomNo}号室`).join('・')}）
                </span>
              </p>
              <Link className={s.noticeBtn} to="/payments">
                家賃の入金をひらく
              </Link>
            </>
          )}
        </section>

        <div className={s.grid}>
          <button className={`${s.tile} ${s.t1}`} disabled>
            <span className={s.tileNo}>①</span>
            <span>
              <span className={s.tileName}>入居者・契約</span>
              <span className={s.tileSub}>準備中</span>
            </span>
          </button>
          <Link className={`${s.tile} ${s.t2}`} to="/payments">
            <span className={s.tileNo}>②</span>
            <span>
              <span className={s.tileName}>家賃の入金</span>
              <span className={s.tileSub}>
                {summary
                  ? unpaid.length === 0
                    ? `今月ぶん ${yen(summary.received)}`
                    : `まだ ${unpaid.length}件`
                  : '…'}
              </span>
            </span>
          </Link>
          <button className={`${s.tile} ${s.t3}`} disabled>
            <span className={s.tileNo}>③</span>
            <span>
              <span className={s.tileName}>修繕・費用</span>
              <span className={s.tileSub}>準備中</span>
            </span>
          </button>
          <button className={`${s.tile} ${s.t4}`} disabled>
            <span className={s.tileNo}>④</span>
            <span>
              <span className={s.tileName}>空室の状況</span>
              <span className={s.tileSub}>準備中</span>
            </span>
          </button>
        </div>

        <section className={s.dev}>
          <h2 className={s.devTitle}>作っている間だけの欄</h2>
          <p className={s.devNote}>
            入居者を登録する画面はこれから作ります。それまでのあいだ、
            架空の10部屋を入れて動きを試せるようにしてあります。
            実際の入居者を登録できるようになったら、この欄は消えます。
          </p>
          <div className={s.devRow}>
            <button onClick={() => handleSample(true)} disabled={busy}>
              見本データを入れる
            </button>
            <button onClick={() => handleSample(false)} disabled={busy}>
              全部消す
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

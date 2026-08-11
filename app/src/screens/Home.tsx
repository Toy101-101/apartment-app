import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildContractRows, needsAttention, renewalText } from '../lib/contracts'
import { formatDate, formatMonth, formatYear, today, yen } from '../lib/date'
import { buildMonthRows, summarize, thisMonth } from '../lib/rent'
import {
  buildEquipmentRows, needsAttention as equipmentDue, overdue as equipmentOverdue,
} from '../lib/equipment'
import { hasSampleData, removeSample } from '../lib/sample'
import { readRenewalNoticeDays } from '../lib/settings'
import {
  buildScheduleRows, needsAttention as schedulesDue,
} from '../lib/schedules'
import { buildVacancyRows, countStates } from '../lib/vacancy'
import { buildYear } from '../lib/yearly'
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
  const year = Number(month.slice(0, 4))

  const view = useLiveQuery(async () => {
    const [
      rooms, leases, tenants, rentTerms, payments, expenses, schedules, equipment, sample, lastShare,
    ] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
      // 今年ぶんをまとめて読む。②の集計は buildMonthRows が月で絞るので、これで足りる
      db.payments.where('month').between(`${year}-01`, `${year}-12`, true, true).toArray(),
      db.expenses.toArray(),
      db.schedules.toArray(),
      db.equipment.toArray(),
      hasSampleData(),
      db.meta.get('lastShareAt'),
    ])
    const noticeDays = await readRenewalNoticeDays()
    const equipmentRows = buildEquipmentRows({ equipment, rooms })
    return {
      due: schedulesDue(buildScheduleRows(schedules)),
      scheduleCount: schedules.filter((s) => !s.deletedAt).length,
      equipmentCount: equipmentRows.length,
      equipmentSoon: equipmentDue(equipmentRows).length,
      equipmentOver: equipmentOverdue(equipmentRows).length,
      money: summarize(buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })),
      renewals: needsAttention(buildContractRows({ leases, rooms, tenants, rentTerms, noticeDays })),
      expenses: expenses.filter((e) => !e.deletedAt).length,
      vacant: countStates(buildVacancyRows({ rooms, leases, tenants })).vacant,
      yearNet: buildYear({ year, rooms, leases, rentTerms, payments, expenses }).net,
      lastShareAt: lastShare?.value,
      sample,
    }
  }, [month, year])

  const unpaid = view?.money.unpaid ?? []
  const renewals = view?.renewals ?? []
  const due = view?.due ?? []
  const calm = view && unpaid.length === 0 && renewals.length === 0 && due.length === 0

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

          {/* 年に1回・4回しか来ないもの。落とすと取り返しがつかないので、家賃と同じ枠に出す */}
          {due.length > 0 && (
            <ul className={s.noticeList}>
              {due.map((r) => (
                <li key={r.schedule.id}>
                  <Link to="/schedules">
                    {r.schedule.title}
                    <span className={r.level === 'red' ? s.soonRed : s.soonYellow}>
                      {r.text}
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

        <Link className={s.keep} to="/schedules">
          <span className={s.keepName}>⑤ 年間の予定（保険・税金・点検）</span>
          <span className={s.keepSub}>
            {view
              ? view.scheduleCount === 0
                ? 'まだ登録がありません'
                : due.length > 0
                  ? `${view.scheduleCount}件のうち、${due.length}件が近づいています`
                  : `${view.scheduleCount}件を見ています`
              : '…'}
          </span>
        </Link>

        {/* 給湯器の替え時は「今日、急いですること」ではないので、上のお知らせ枠には出さない。
            そのかわり、替え時が来ていたら入口の色を変えて気づけるようにする */}
        <Link
          className={`${s.keep} ${view && view.equipmentOver > 0 ? s.keepWarn : ''}`}
          to="/equipment"
        >
          <span className={s.keepName}>⑥ 設備の年式（給湯器・エアコン）</span>
          <span className={s.keepSub}>
            {view
              ? view.equipmentCount === 0
                ? 'まだ登録がありません'
                : view.equipmentOver > 0
                  ? `${view.equipmentOver}台が替え時を過ぎています`
                  : view.equipmentSoon > 0
                    ? `${view.equipmentSoon}台が、そろそろ替え時です`
                    : `${view.equipmentCount}台を見ています`
              : '…'}
          </span>
        </Link>

        <Link className={s.keep} to="/yearly">
          <span className={s.keepName}>年ごとのまとめ</span>
          <span className={s.keepSub}>
            {view
              ? `${formatYear(year)}分は、いまのところ ${yen(view.yearNet)}`
              : '確定申告のときに使います'}
          </span>
        </Link>

        <Link className={s.keep} to="/backup">
          <span className={s.keepName}>控えを家族に送る・印刷する</span>
          <span className={s.keepSub}>
            {view?.lastShareAt
              ? `最後に送ったのは ${formatDate(view.lastShareAt)}`
              : 'まだ一度も送っていません'}
          </span>
        </Link>

        {/* 設定はめったに触らない。帯にはせず、いちばん下に静かに置く */}
        <Link className={s.settings} to="/settings">
          設定
        </Link>

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

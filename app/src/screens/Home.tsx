import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildContractRows, needsAttention, renewalText } from '../lib/contracts'
import { IS_DEMO } from '../lib/demo'
import { formatDate, formatMonth, formatYear, today, yen } from '../lib/date'
import { buildMonthRows, summarize, thisMonth } from '../lib/rent'
import {
  buildEquipmentRows, needsAttention as equipmentDue, overdue as equipmentOverdue,
} from '../lib/equipment'
import { pendingMoveOuts } from '../lib/moveout'
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

  /*
   * 読み込みを3つに分けてある。
   *
   * ひとまとめにすると、`useLiveQuery` は「読んだ表のどれかが変わったら、また全部やり直す」
   * ので、家賃を1件「済」にしただけで設備の替え時や見本の有無まで計算し直していた。
   * 分けておけば、入金は notice と year だけ、設備を足したときは keep だけが動く。
   *
   * 分け方は画面の並びではなく「どの表を読むか」で決めている。
   * 同じ表を読むものを一緒にしないと、分けた意味が無くなるため。
   */

  // ① 今日のこと。お知らせ枠と、①②④⑤の入口
  const notice = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms, payments, schedules, moveOuts, noticeDays] =
      await Promise.all([
        db.rooms.toArray(),
        db.leases.toArray(),
        db.tenants.toArray(),
        db.rentTerms.toArray(),
        // 必要なのは今月ぶんだけ。年ぶんを読むのは下の year のほう
        db.payments.where('month').equals(month).toArray(),
        db.schedules.toArray(),
        db.moveOuts.toArray(),
        readRenewalNoticeDays(),
      ])
    return {
      money: summarize(buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })),
      renewals: needsAttention(buildContractRows({ leases, rooms, tenants, rentTerms, noticeDays })),
      moveOuts: pendingMoveOuts({ leases, rooms, tenants, moveOuts }),
      due: schedulesDue(buildScheduleRows(schedules)),
      scheduleCount: schedules.filter((s) => !s.deletedAt).length,
      vacant: countStates(buildVacancyRows({ rooms, leases, tenants })).vacant,
    }
  }, [month])

  // ② 年ぶんの集計。12か月ぶんを回すのでいちばん重い。入金か費用が変わったときだけ動かす
  const yearly = useLiveQuery(async () => {
    const [rooms, leases, rentTerms, payments, expenses, firstPaid] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.rentTerms.toArray(),
      db.payments.where('month').between(`${year}-01`, `${year}-12`, true, true).toArray(),
      db.expenses.toArray(),
      // 「いつから記録を付けはじめたか」。ここで読む入金は今年ぶんだけなので、
      // buildYear に任せると「今年の最初の入金」を付けはじめた月と取りちがえ、
      // 年ごとのまとめの画面と数字が食いちがう。月の索引で1件だけ引いて渡す
      db.payments.orderBy('month').filter((p) => !p.deletedAt).first(),
    ])
    return {
      net: buildYear({
        year, rooms, leases, rentTerms, payments, expenses, from: firstPaid?.month,
      }).net,
      expenseCount: expenses.filter((e) => !e.deletedAt).length,
    }
  }, [year])

  // ③ めったに変わらないもの。⑥設備・控えを送った日・見本が入っているか
  const keep = useLiveQuery(async () => {
    const [equipment, rooms, sample, lastShare] = await Promise.all([
      db.equipment.toArray(),
      db.rooms.toArray(),
      hasSampleData(),
      db.meta.get('lastShareAt'),
    ])
    const rows = buildEquipmentRows({ equipment, rooms })
    return {
      equipmentCount: rows.length,
      equipmentSoon: equipmentDue(rows).length,
      equipmentOver: equipmentOverdue(rows).length,
      lastShareAt: lastShare?.value,
      sample,
    }
  }, [])

  const unpaid = notice?.money.unpaid ?? []
  const renewals = notice?.renewals ?? []
  const due = notice?.due ?? []
  const moving = notice?.moveOuts ?? []
  const calm = notice
    && unpaid.length === 0 && renewals.length === 0 && due.length === 0 && moving.length === 0

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.barTitle}>アパート管理</div>
      </header>

      <main className={s.body}>
        <section className={`${s.notice} ${calm || !notice ? '' : s.noticeWarn}`}>
          <p className={s.noticeHead}>{formatDate(today())}</p>

          {!notice && <p className={s.noticeCalm}>読み込んでいます…</p>}
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

          {/* 敷金は返す義務のあるお金。遅れるとそのまま揉めごとになるので、この枠に出す */}
          {moving.length > 0 && (
            <ul className={s.noticeList}>
              {moving.map((m) => (
                <li key={m.lease.id}>
                  <Link to={`/contracts/${m.lease.id}/moveout`}>
                    {m.room?.roomNo}号室 {m.tenant?.name} の退去
                    <span className={s.soonRed}>手続きが残り{m.remaining}件</span>
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
                {notice ? `${notice.money.occupied}件` : '…'}
              </span>
            </span>
          </Link>
          <Link className={`${s.tile} ${s.t2}`} to="/payments">
            <span className={s.tileNo}>②</span>
            <span>
              <span className={s.tileName}>家賃の入金</span>
              <span className={s.tileSub}>
                {notice
                  ? unpaid.length === 0
                    ? `今月ぶん ${yen(notice.money.received)}`
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
                {yearly ? `${yearly.expenseCount}件` : '…'}
              </span>
            </span>
          </Link>
          <Link className={`${s.tile} ${s.t4}`} to="/vacancy">
            <span className={s.tileNo}>④</span>
            <span>
              <span className={s.tileName}>空室の状況</span>
              <span className={s.tileSub}>
                {notice
                  ? notice.vacant === 0
                    ? 'すべて入居中'
                    : `空室 ${notice.vacant}室`
                  : '…'}
              </span>
            </span>
          </Link>
        </div>

        <Link className={s.keep} to="/schedules">
          <span className={s.keepName}>⑤ 年間の予定（保険・税金・点検）</span>
          <span className={s.keepSub}>
            {notice
              ? notice.scheduleCount === 0
                ? 'まだ登録がありません'
                : due.length > 0
                  ? `${notice.scheduleCount}件のうち、${due.length}件が近づいています`
                  : `${notice.scheduleCount}件を見ています`
              : '…'}
          </span>
        </Link>

        {/* 給湯器の替え時は「今日、急いですること」ではないので、上のお知らせ枠には出さない。
            そのかわり、替え時が来ていたら入口の色を変えて気づけるようにする */}
        <Link
          className={`${s.keep} ${keep && keep.equipmentOver > 0 ? s.keepWarn : ''}`}
          to="/equipment"
        >
          <span className={s.keepName}>⑥ 設備の年式（給湯器・エアコン）</span>
          <span className={s.keepSub}>
            {keep
              ? keep.equipmentCount === 0
                ? 'まだ登録がありません'
                : keep.equipmentOver > 0
                  ? `${keep.equipmentOver}台が替え時を過ぎています`
                  : keep.equipmentSoon > 0
                    ? `${keep.equipmentSoon}台が、そろそろ替え時です`
                    : `${keep.equipmentCount}台を見ています`
              : '…'}
          </span>
        </Link>

        <Link className={s.keep} to="/yearly">
          <span className={s.keepName}>年ごとのまとめ</span>
          <span className={s.keepSub}>
            {yearly
              ? `${formatYear(year)}分は、いまのところ ${yen(yearly.net)}`
              : '確定申告のときに使います'}
          </span>
        </Link>

        <Link className={s.keep} to="/backup">
          <span className={s.keepName}>控えを家族に送る・印刷する</span>
          <span className={s.keepSub}>
            {keep?.lastShareAt
              ? `最後に送ったのは ${formatDate(keep.lastShareAt)}`
              : 'まだ一度も送っていません'}
          </span>
        </Link>

        {/*
          どれもめったに触らない。帯にはせず、いちばん下に静かに置く。
          「消したものを戻す」は、慌てて探す人がいちばん先に見るのがホームなので、
          消した画面の中ではなくここに置いた（`.quiet` は折り返すので、
          文字を大きくすると3つが縦に並ぶ）。
          「最近の操作」に件数を出さないのは、出すと全部の表を読むことになり、
          上で3つに分けた意味が無くなるため（家賃を1件つけるたびに全部読み直す形に戻る）
        */}
        <div className={s.quiet}>
          <Link className={s.settings} to="/activity">
            最近の操作
          </Link>
          <Link className={s.settings} to="/trash">
            消したものを戻す
          </Link>
          <Link className={s.settings} to="/settings">
            設定
          </Link>
        </div>

        {/* 見本を入れた端末にだけ出る。消せば二度と出ない。
            見本モード（?demo=1）では中身が全部見本なので出さない（帯のボタンでやり直せる） */}
        {!IS_DEMO && keep?.sample && (
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

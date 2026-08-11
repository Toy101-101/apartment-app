import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatDate, today, yen } from '../lib/date'
import {
  buildScheduleRows, completeSchedule, everyText, KIND_LABEL, type ScheduleRow,
} from '../lib/schedules'
import s from './Schedules.module.css'

/**
 * ⑤ 年間の予定（保険の更新・税金の納期・点検）
 *
 * 毎月来る家賃は忘れない。忘れるのは年に1回や4回しか来ないもののほう。
 * 火災保険の更新を落とすと、その1年は無保険になる。
 *
 * 一覧は**近い順**。過ぎているものが必ずいちばん上に来る。
 * 「済んだ」を押すと次回の日付が自動で進むので、日付を計算しなくてよい。
 */
/** type="date" が使えない端末では文字で入るので、形を確かめてから使う */
const DATE = /^\d{4}-\d{2}-\d{2}$/

export default function Schedules() {
  const [doing, setDoing] = useState<ScheduleRow | null>(null)
  const [doneOn, setDoneOn] = useState(today())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const rows = useLiveQuery(async () => buildScheduleRows(await db.schedules.toArray()), [])

  function start(row: ScheduleRow) {
    setMessage('')
    setDoing(row)
    setDoneOn(today())
    // 「だいたいの金額」は入れない。直さずに押されると、見込みがそのまま実費として残ってしまう
    setAmount('')
  }

  async function done() {
    if (!doing) return
    if (!DATE.test(doneOn)) {
      setMessage('済ませた日を入れてください。')
      return
    }
    setBusy(true)
    try {
      const yenAmount = Number(amount.replace(/[^0-9]/g, ''))
      const result = await completeSchedule(doing.schedule.id, {
        date: doneOn,
        amount: yenAmount > 0 ? yenAmount : undefined,
      })
      setMessage(
        result.nextDate
          ? `済みにしました。次は ${formatDate(result.nextDate)} です。`
          : '済みにしました。1回きりの予定なので、一覧から外しました。',
      )
      setDoing(null)
      setAmount('')
    } catch {
      setMessage('うまくいきませんでした。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="⑤ 年間の予定">
      <Link className={s.add} to="/schedules/new">
        ＋ 予定を足す
      </Link>

      {rows === undefined && <p className={s.note}>読み込んでいます…</p>}

      {rows?.length === 0 && (
        <p className={s.note}>
          まだ1件も登録がありません。
          火災保険の更新、固定資産税の納期、消防設備点検のように、
          年に1回か4回しか来ないものを入れておくと、近づいたときにホームでお知らせします。
        </p>
      )}

      {message && (
        <p className={s.result} role="status" aria-live="polite">
          {message}
        </p>
      )}

      {rows?.map((row) => {
        const { schedule } = row
        return (
          <section
            key={schedule.id}
            className={`${s.card} ${row.level === 'red' ? s.red : row.level === 'yellow' ? s.yellow : ''}`}
          >
            <div className={s.head}>
              <h2 className={s.title}>{schedule.title}</h2>
              <span className={s.kind}>{KIND_LABEL[schedule.kind]}</span>
            </div>

            <p className={`${s.when} num`}>
              {formatDate(schedule.nextDate)}
              <span className={row.level === 'none' ? s.days : s.daysWarn}>{row.text}</span>
            </p>

            <p className={s.meta}>
              {everyText(schedule.everyMonths)}
              {schedule.amount ? <> ・ だいたい <b className="num">{yen(schedule.amount)}</b></> : null}
              {schedule.vendor ? ` ・ ${schedule.vendor}` : ''}
            </p>
            {schedule.memo && <p className={s.memo}>{schedule.memo}</p>}

            {doing?.schedule.id === schedule.id ? (
              <div className={s.confirm}>
                {/* 日付を今日で決め打ちにすると、去年払ったものを今年に付けてしまい、
                    確定申告の年がずれる。あとから記録することがあるので、必ず選べるようにする */}
                <label className={s.label} htmlFor={`doneOn-${schedule.id}`}>
                  済ませた日（実際に払った日）
                </label>
                <input
                  id={`doneOn-${schedule.id}`}
                  className="num"
                  type="date"
                  value={doneOn}
                  onChange={(e) => setDoneOn(e.target.value)}
                />

                <label className={s.label} htmlFor={`amount-${schedule.id}`}>
                  かかった金額（分からなければ空のままで結構です）
                </label>
                <input
                  id={`amount-${schedule.id}`}
                  className="num"
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  placeholder="48000"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className={s.small}>
                  {schedule.amount ? (
                    <>
                      だいたい <b className="num">{yen(schedule.amount)}</b> と登録してありますが、
                      ここには<b>実際に払った額</b>を入れてください。{' '}
                    </>
                  ) : null}
                  金額を入れると、③修繕・費用にも記録が残ります。
                  空のままなら、次回の日付を進めるだけです。
                </p>
                <button className={s.primary} onClick={() => void done()} disabled={busy}>
                  {busy
                    ? '記録しています…'
                    : DATE.test(doneOn)
                      ? `${formatDate(doneOn)}に済んだことにする`
                      : '済んだことにする'}
                </button>
                <button className={s.secondary} onClick={() => setDoing(null)} disabled={busy}>
                  やめる
                </button>
              </div>
            ) : (
              <div className={s.actions}>
                <button className={s.primary} onClick={() => start(row)}>
                  済んだことにする
                </button>
                <Link className={s.secondary} to={`/schedules/${schedule.id}/edit`}>
                  直す
                </Link>
              </div>
            )}
          </section>
        )
      })}
    </Screen>
  )
}

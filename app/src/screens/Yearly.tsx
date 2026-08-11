import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatYear, yen } from '../lib/date'
import { availableYears, buildYear } from '../lib/yearly'
import s from './Yearly.module.css'

/**
 * 年ごとのまとめ（確定申告のときに使う）
 *
 * 毎年2月から3月に、1年ぶんの家賃と修繕費を数え直す作業がある。
 * 記録はもう全部この中にあるので、足し算はこちらでやってしまう。
 *
 * 画面の作り
 * - いちばん上に、答えになる数字を3つだけ大きく置く（入った・出ていった・差引）
 * - 内訳と月ごとの表は、その下。税務署や税理士に見せるときだけ要るもの
 * - 数え方（何月分で数えているか、敷金を入れていないか）を必ず画面に書く。
 *   書いていないと、帳簿と合わないときに原因を追えない
 */
export default function Yearly() {
  const [year, setYear] = useState<number | null>(null)

  const view = useLiveQuery(async () => {
    const [rooms, leases, rentTerms, payments, expenses] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.rentTerms.toArray(),
      db.payments.toArray(),
      db.expenses.toArray(),
    ])
    const years = availableYears({ leases, payments, expenses })
    // はじめて開いたときは今年（years の先頭）
    const shown = year !== null && years.includes(year) ? year : years[0]
    return {
      years,
      shown,
      summary: buildYear({ year: shown, rooms, leases, rentTerms, payments, expenses }),
    }
  }, [year])

  if (!view) {
    return (
      <Screen title="年ごとのまとめ">
        <p className={s.note}>読み込んでいます…</p>
      </Screen>
    )
  }

  const { years, shown, summary } = view
  const at = years.indexOf(shown)
  const older = years[at + 1] // 前の年（配列は新しい順）
  const newer = years[at - 1]

  return (
    <Screen title="年ごとのまとめ">
      <div className={s.pager}>
        <button
          onClick={() => older !== undefined && setYear(older)}
          disabled={older === undefined}
          aria-label="前の年を見る"
        >
          ‹ {older !== undefined ? formatYear(older) : ''}
        </button>
        <div className={`${s.year} num`}>{formatYear(shown)}分</div>
        <button
          onClick={() => newer !== undefined && setYear(newer)}
          disabled={newer === undefined}
          aria-label="次の年を見る"
        >
          {newer !== undefined ? formatYear(newer) : ''} ›
        </button>
      </div>

      {summary.empty && (
        <p className={s.note}>
          {formatYear(shown)}の記録は、まだ1件もありません。
        </p>
      )}

      {!summary.empty && (
        <>
          <section className={s.headline}>
            <div className={s.big}>
              <span className={s.bigLabel}>入ったお金</span>
              <b className={`${s.bigNum} ${s.in} num`}>{yen(summary.income)}</b>
            </div>
            <div className={s.big}>
              <span className={s.bigLabel}>出ていったお金</span>
              <b className={`${s.bigNum} ${s.out} num`}>{yen(summary.expense)}</b>
            </div>
            <div className={`${s.big} ${s.netBox}`}>
              <span className={s.bigLabel}>差引</span>
              <b className={`${s.bigNum} num`}>{yen(summary.net)}</b>
            </div>
          </section>

          {summary.rentUnpaid > 0 && (
            <p className={s.warn}>
              まだ入っていない家賃が <b className="num">{yen(summary.rentUnpaid)}</b>
              （{summary.unpaidCount}か月ぶん）あります。
              上の「入ったお金」には、これは入っていません。
            </p>
          )}

          <section className={s.card}>
            <h2 className={s.title}>入ったお金の内訳</h2>
            <ul className={s.list}>
              <li>
                <span>家賃・管理費</span>
                <b className="num">{yen(summary.rentReceived)}</b>
              </li>
              <li>
                <span>礼金</span>
                <b className="num">{yen(summary.keyMoney)}</b>
              </li>
              <li className={s.total}>
                <span>合計</span>
                <b className="num">{yen(summary.income)}</b>
              </li>
            </ul>
          </section>

          <section className={s.card}>
            <h2 className={s.title}>出ていったお金の内訳</h2>
            <ul className={s.list}>
              <li>
                <span>修繕</span>
                <b className="num">{yen(summary.repair)}</b>
              </li>
              <li>
                <span>固定費（保険・税金など）</span>
                <b className="num">{yen(summary.fixed)}</b>
              </li>
              <li className={s.total}>
                <span>合計</span>
                <b className="num">{yen(summary.expense)}</b>
              </li>
            </ul>
          </section>

          <section className={s.card}>
            <h2 className={s.title}>月ごと</h2>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>月</th>
                    <th className={s.right}>入った家賃</th>
                    <th className={s.right}>まだの家賃</th>
                    <th className={s.right}>修繕</th>
                    <th className={s.right}>固定費</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.months.map((m) => (
                    <tr key={m.month} className={m.came ? '' : s.future}>
                      <td className={s.month}>{m.no}月</td>
                      <td className={`${s.right} num`}>{m.received ? yen(m.received) : ''}</td>
                      <td className={`${s.right} ${s.unpaid} num`}>
                        {m.unpaid ? yen(m.unpaid) : ''}
                      </td>
                      <td className={`${s.right} num`}>{m.repair ? yen(m.repair) : ''}</td>
                      <td className={`${s.right} num`}>{m.fixed ? yen(m.fixed) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>合計</td>
                    <td className={`${s.right} num`}>{yen(summary.rentReceived)}</td>
                    <td className={`${s.right} num`}>{yen(summary.rentUnpaid)}</td>
                    <td className={`${s.right} num`}>{yen(summary.repair)}</td>
                    <td className={`${s.right} num`}>{yen(summary.fixed)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 帳簿と合わないときに原因を追えるよう、数え方を必ず書いておく */}
      <section className={s.rules}>
        <h2 className={s.rulesTitle}>この数字の数え方</h2>
        <ul>
          <li>1月から12月までで区切っています。</li>
          <li>
            家賃は<b>何月分か</b>で数えます。12月分が翌年1月に入っても、その年のぶんとして数えます。
          </li>
          <li>入ったお金に数えるのは、<b>実際に受け取った額だけ</b>です。</li>
          <li>
            敷金は預かっているお金で、いずれ返すものなので<b>入れていません</b>。礼金は入れています。
          </li>
          <li>ここに出るのは目安です。最後は通帳と見くらべてください。</li>
        </ul>
      </section>
    </Screen>
  )
}

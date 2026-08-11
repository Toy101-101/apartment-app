import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { buildContractRows, needsAttention } from '../lib/contracts'
import {
  DEFAULT_RENEWAL_NOTICE_DAYS, RENEWAL_NOTICE_CHOICES,
  readRenewalNoticeDays, saveRenewalNoticeDays,
} from '../lib/settings'
import s from './Settings.module.css'

/**
 * 設定
 *
 * 建物ぜんぶに1つずつ。契約ごとには持たない。
 * 決める場所が何か所もあると「どこで変えたのか分からない」が必ず起きる。
 *
 * 変えた結果が**その場で見える**ようにしてある。
 * 「60日前にしたら、いま何件が知らせに出るのか」が分からないまま決めさせない。
 */
export default function Settings() {
  const [busy, setBusy] = useState(false)

  const view = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms, noticeDays] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
      readRenewalNoticeDays(),
    ])
    // それぞれの日数にしたら何件が知らせに出るかを、その場で数える
    const countFor = (days: number) =>
      needsAttention(buildContractRows({ leases, rooms, tenants, rentTerms, noticeDays: days })).length
    return {
      noticeDays,
      counts: Object.fromEntries(RENEWAL_NOTICE_CHOICES.map((d) => [d, countFor(d)])) as
        Record<number, number>,
    }
  }, [])

  async function choose(days: number) {
    setBusy(true)
    try {
      await saveRenewalNoticeDays(days)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="設定">
      <section className={s.card}>
        <h2 className={s.title}>契約更新のお知らせ</h2>
        <p className={s.note}>
          契約が終わる日まで、あと何日になったらホームでお知らせするかを決めます。
          建物ぜんぶの契約に、まとめて効きます。
        </p>

        <div className={s.choices}>
          {RENEWAL_NOTICE_CHOICES.map((days) => (
            <button
              key={days}
              aria-pressed={view?.noticeDays === days}
              disabled={busy || !view}
              onClick={() => void choose(days)}
            >
              <span className={s.choiceMain}>{days}日前から</span>
              <span className={s.choiceSub}>
                {view ? `いまなら ${view.counts[days]}件` : '…'}
              </span>
            </button>
          ))}
        </div>

        <p className={s.small}>
          どれを選んでも、<b>残り1か月を切ったものは赤</b>で出ます。
          「30日前から」を選んだときは、出たものがすべて赤になります。
        </p>
        <p className={s.small}>
          はじめの設定は{DEFAULT_RENEWAL_NOTICE_DAYS}日前です。
          更新の案内を早めに出したい場合は90日前、
          直前でよい場合は30日前を選んでください。
        </p>
      </section>

      <section className={s.card}>
        <h2 className={s.title}>そのほかのお知らせ</h2>
        <p className={s.note}>
          <b>家賃の入金</b>は、その月に入っていないものを毎日お知らせします。
        </p>
        <p className={s.note}>
          <b>保険・税金・点検</b>を何日前から知らせるかは、
          ⑤年間の予定の中で、予定ごとに決められます。
          年に1回のものと4回のものでは、ちょうどよい早さが違うためです。
        </p>
        <p className={s.note}>
          <b>設備の替え時</b>は、急いですることではないので、
          ホームのお知らせ枠には出しません。⑥設備の年式の入口の色が変わります。
        </p>
      </section>

      <section className={s.card}>
        <h2 className={s.title}>この設定の控え</h2>
        <p className={s.note}>
          設定は記録と一緒に控えへ入ります。
          機種を変えても、控えを読み込めばこの設定はもどります。
        </p>
      </section>
    </Screen>
  )
}

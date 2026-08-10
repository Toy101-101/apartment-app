import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setMeta, SCHEMA_VERSION } from '../db'
import { formatDate, today } from '../lib/date'
import s from './Home.module.css'

/**
 * ホーム画面
 *
 * フェーズ0の時点では、4つの入口はまだ押せない（中身が無いため）。
 * 代わりに「動作確認」の欄を置き、祖父のスマホで
 *   ・保存が効いているか（IndexedDB）
 *   ・電波が無くても開けるか
 * を実機で確かめられるようにしてある。中身ができたらこの欄は外す。
 */
export default function Home() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // 保存されている件数と、最後に保存した時刻（画面は自動で更新される）
  const rows = useLiveQuery(() => db.meta.toArray(), [], [])
  const lastSaved = rows.find((r) => r.key === 'lastCheckAt')?.value

  async function handleCheck() {
    const count = Number(rows.find((r) => r.key === 'checkCount')?.value ?? 0) + 1
    await setMeta('checkCount', String(count))
    await setMeta('lastCheckAt', new Date().toLocaleString('ja-JP'))
    await setMeta('schemaVersion', String(SCHEMA_VERSION))
  }

  const count = rows.find((r) => r.key === 'checkCount')?.value ?? '0'

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.barTitle}>アパート管理</div>
      </header>

      <main className={s.body}>
        <section className={s.notice}>
          <p className={s.noticeHead}>{formatDate(today())}</p>
          <p className={s.noticeCalm}>今日は、急いですることはありません</p>
        </section>

        <div className={s.grid}>
          <button className={`${s.tile} ${s.t1}`} disabled>
            <span className={s.tileNo}>①</span>
            <span>
              <span className={s.tileName}>入居者・契約</span>
              <span className={s.tileSub}>準備中</span>
            </span>
          </button>
          <button className={`${s.tile} ${s.t2}`} disabled>
            <span className={s.tileNo}>②</span>
            <span>
              <span className={s.tileName}>家賃の入金</span>
              <span className={s.tileSub}>準備中</span>
            </span>
          </button>
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

        <section className={s.check}>
          <h2 className={s.checkTitle}>動作確認（作っている間だけの欄です）</h2>
          <p className={s.checkNote}>
            下のボタンを押して数が増え、アプリを閉じて開き直しても数が残っていれば、
            この端末に記録を残せる状態になっています。
          </p>
          <ul className={s.checkList}>
            <li>
              <span>押した回数</span>
              <b className="num">{count} 回</b>
            </li>
            <li>
              <span>最後に保存した時刻</span>
              <b className="num">{lastSaved ?? 'まだありません'}</b>
            </li>
            <li>
              <span>通信</span>
              <b className={online ? s.online : s.offline}>
                {online ? 'つながっています' : '電波がありません（表示は続きます）'}
              </b>
            </li>
          </ul>
          <button className={s.checkBtn} onClick={handleCheck}>
            保存してみる
          </button>
        </section>
      </main>
    </div>
  )
}

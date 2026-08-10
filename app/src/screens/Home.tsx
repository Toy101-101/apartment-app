import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setMeta } from '../db'
import { shareBackup } from '../lib/backup'
import { formatDate, today } from '../lib/date'
import s from './Home.module.css'

/**
 * ホーム画面
 *
 * 4つの入口はまだ押せない（中身が無いため）。
 * 代わりに置いてあるのは「控えを家族に送る」欄で、これは作りかけの仮の欄ではない。
 * iOSはホーム画面のアイコンを消すと中のデータも消えるため、
 * 記録を入れ始める前から、いつでも控えを取り出せる状態にしておく必要がある。
 */
export default function Home() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // 端末に入っている件数と、最後に控えを送った日（画面は自動で更新される）
  const stat = useLiveQuery(async () => {
    const [tenants, leases, payments, expenses, notes, photos, lastShareAt] = await Promise.all([
      db.tenants.count(),
      db.leases.count(),
      db.payments.count(),
      db.expenses.count(),
      db.notes.count(),
      db.photos.count(),
      db.meta.get('lastShareAt'),
    ])
    return {
      records: tenants + leases + payments + expenses + notes,
      photos,
      lastShareAt: lastShareAt?.value,
    }
  }, [])

  async function handleShare() {
    setBusy(true)
    setMessage('')
    try {
      const result = await shareBackup()
      if (result === 'cancelled') {
        setMessage('送るのをやめました。')
        return
      }
      await setMeta('lastShareAt', today())
      setMessage(
        result === 'shared'
          ? '控えを送りました。'
          : '控えをこの端末に保存しました。（ダウンロードの中にあります）',
      )
    } catch {
      setMessage('うまくいきませんでした。もう一度お試しください。')
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

        <section className={s.backup}>
          <h2 className={s.backupTitle}>控えを家族に送る</h2>
          <p className={s.backupNote}>
            記録はこのスマホの中だけにあります。
            機種変更や、ホーム画面からアイコンを消したときに消えてしまわないよう、
            ときどき控えを家族に送っておいてください。
          </p>
          <ul className={s.backupList}>
            <li>
              <span>いまの記録</span>
              <b className="num">{stat ? `${stat.records} 件` : '…'}</b>
            </li>
            <li>
              <span>写真</span>
              <b className="num">{stat ? `${stat.photos} 枚` : '…'}</b>
            </li>
            <li>
              <span>最後に送った日</span>
              <b className="num">
                {stat?.lastShareAt ? formatDate(stat.lastShareAt) : 'まだ送っていません'}
              </b>
            </li>
          </ul>
          <button className={s.backupBtn} onClick={handleShare} disabled={busy}>
            {busy ? '用意しています…' : '控えを家族に送る'}
          </button>
          <p className={s.backupResult} role="status" aria-live="polite">
            {message}
          </p>
          <p className={s.backupSmall}>
            写真は大きいため、控えのファイルには入りません（別に送ります）。
          </p>
        </section>
      </main>
    </div>
  )
}

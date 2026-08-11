import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db, setMeta } from '../db'
import {
  BACKUP_TABLES, importPhotoFiles, parseBackup, restoreBackup, shareBackup, type Backup,
} from '../lib/backup'
import { formatDate, today } from '../lib/date'
import s from './Backup.module.css'

/**
 * 控えを家族に送る・読み込む
 *
 * 記録はこの端末のIndexedDBにしかない。iOSはホーム画面のアイコンを消すと
 * 中のデータも一緒に消えるので、控えを送っておくことが唯一の保険になる。
 *
 * 写真は控えJSONに入れず、別のファイルとして一緒に渡す。
 * 読み込むときは、JSONと写真をまとめて選べばよい。
 */

const TABLE_LABEL: Record<string, string> = {
  rooms: '部屋',
  tenants: '入居者',
  leases: '契約',
  rentTerms: '家賃の履歴',
  payments: '入金',
  paymentLog: '入金の操作',
  expenses: '修繕・費用',
  notes: 'いきさつメモ',
  meta: '設定',
}

export default function Backup() {
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ backup: Backup; photos: File[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const stat = useLiveQuery(async () => {
    const [rooms, leases, payments, expenses, notes, photos, lastShareAt] = await Promise.all([
      db.rooms.count(), db.leases.count(), db.payments.count(),
      db.expenses.count(), db.notes.count(), db.photos.count(),
      db.meta.get('lastShareAt'),
    ])
    return {
      records: rooms + leases + payments + expenses + notes,
      photos,
      lastShareAt: lastShareAt?.value,
    }
  }, [])

  async function handleShare() {
    setBusy(true)
    setMessage('')
    setFailed('')
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
          : result === 'shared-without-photos'
            ? '控えを送りました。写真が多いため、今回は写真を除いて送っています。'
            : '控えをこの端末に保存しました。（ダウンロードの中にあります）',
      )
    } catch {
      setFailed('うまくいきませんでした。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  /** 選んだファイルを読み取るだけ。まだ書き戻さない */
  async function handleChoose(files: FileList | null) {
    setMessage('')
    setFailed('')
    setPending(null)
    if (!files || files.length === 0) return

    const list = Array.from(files)
    const json = list.find((f) => f.name.endsWith('.json'))
    if (!json) {
      setFailed('控えのファイル（.json）が見つかりませんでした。')
      return
    }
    try {
      setPending({
        backup: parseBackup(await json.text()),
        photos: list.filter((f) => f.type.startsWith('image/')),
      })
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'このファイルは読み取れませんでした。')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  /** ここで初めて端末の中身を置きかえる */
  async function handleRestore() {
    if (!pending) return
    setBusy(true)
    setFailed('')
    try {
      await restoreBackup(pending.backup)
      const photos = await importPhotoFiles(pending.photos)
      setPending(null)
      setMessage(
        photos > 0
          ? `控えを読み込みました。写真も${photos}枚もどしました。`
          : '控えを読み込みました。',
      )
    } catch {
      setFailed('読み込めませんでした。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="控えと印刷">
      <section className={s.card}>
        <h2 className={s.title}>控えを家族に送る</h2>
        <p className={s.note}>
          記録はこのスマホの中だけにあります。
          機種変更や、ホーム画面からアイコンを消したときに消えてしまわないよう、
          ときどき控えを家族に送っておいてください。
        </p>
        <ul className={s.list}>
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
        <button className={s.primary} onClick={handleShare} disabled={busy}>
          {busy ? '用意しています…' : '控えを家族に送る'}
        </button>
        <p className={s.small}>
          控えのファイルと写真を、まとめてLINEやメールで送れます。
          送り先は、ご自身あてでもかまいません。
        </p>
      </section>

      <section className={s.card}>
        <h2 className={s.title}>印刷する</h2>
        <p className={s.note}>
          入居者・家賃・連絡先を1枚にまとめて印刷できます。
          紙で手元に置いておきたいときや、家族に渡すときに。
        </p>
        <Link className={s.secondary} to="/print">
          印刷する紙を見る
        </Link>
      </section>

      <section className={s.card}>
        <h2 className={s.title}>控えを読み込む</h2>
        <p className={s.note}>
          送った控えのファイルを、別の端末で開くときに使います。
          写真も一緒に選べば、写真ももどります。
        </p>
        <p className={s.warn}>
          読み込むと、<b>いまこの端末に入っている記録は置きかわります。</b>
        </p>

        <input
          ref={input}
          className={s.file}
          type="file"
          accept=".json,application/json,image/*"
          multiple
          onChange={(e) => void handleChoose(e.target.files)}
        />
        <button className={s.secondary} onClick={() => input.current?.click()} disabled={busy}>
          控えのファイルを選ぶ
        </button>

        {pending && (
          <div className={s.confirm}>
            <p className={s.confirmTitle}>この控えを読み込みますか？</p>
            <ul className={s.list}>
              {BACKUP_TABLES.filter((name) => (pending.backup.counts[name] ?? 0) > 0).map((name) => (
                <li key={name}>
                  <span>{TABLE_LABEL[name] ?? name}</span>
                  <b className="num">{pending.backup.counts[name]} 件</b>
                </li>
              ))}
              <li>
                <span>写真</span>
                <b className="num">{pending.photos.length} 枚</b>
              </li>
              <li>
                <span>書き出した日</span>
                <b className="num">
                  {pending.backup.exportedAt
                    ? formatDate(pending.backup.exportedAt.slice(0, 10))
                    : '分かりません'}
                </b>
              </li>
            </ul>
            <button className={s.danger} onClick={handleRestore} disabled={busy}>
              {busy ? '読み込んでいます…' : 'はい、いまの記録を置きかえます'}
            </button>
            <button className={s.secondary} onClick={() => setPending(null)} disabled={busy}>
              やめる
            </button>
          </div>
        )}
      </section>

      {message && (
        <p className={s.result} role="status" aria-live="polite">
          {message}
        </p>
      )}
      {failed && (
        <p className={s.failed} role="status" aria-live="polite">
          {failed}
        </p>
      )}
    </Screen>
  )
}

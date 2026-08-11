import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatDate, yen } from '../lib/date'
import { KIND_LABEL, removeExpense } from '../lib/expenses'
import { loadPhotos, removePhotos, type PickedPhoto } from '../lib/photos'
import s from './ExpenseDetail.module.css'

/**
 * 費用の詳細
 *
 * 「なぜ、この対応をしたか」を金額より先、いちばん大きく置く。
 * 領収書には金額しか残らない。残すべきはそちらではない。
 */
export default function ExpenseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    if (!id) return null
    const expense = await db.expenses.get(id)
    if (!expense || expense.deletedAt) return null
    const room = expense.roomId ? await db.rooms.get(expense.roomId) : undefined
    return { expense, room }
  }, [id])

  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const photoIds = data?.expense.photoIds
  useEffect(() => {
    if (!photoIds || photoIds.length === 0) {
      setPhotos([])
      return
    }
    let alive = true
    void loadPhotos(photoIds).then((list) => {
      if (alive) setPhotos(list)
    })
    return () => {
      alive = false
    }
  }, [photoIds])

  if (data === undefined) {
    return <Screen title="費用の記録" back="/expenses"><p className={s.note}>読み込んでいます…</p></Screen>
  }
  if (data === null) {
    return (
      <Screen title="費用の記録" back="/expenses" backLabel="一覧にもどる">
        <p className={s.note}>その記録が見つかりませんでした。</p>
      </Screen>
    )
  }

  const { expense, room } = data

  async function handleDelete() {
    setBusy(true)
    try {
      // 写真は誰も見られなくなるので、記録と一緒に片づける
      await removePhotos(expense.photoIds)
      await removeExpense(expense.id)
      navigate('/expenses')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="費用の記録" back="/expenses" backLabel="一覧にもどる">
      <section className={s.head}>
        <div className={`${s.date} num`}>{formatDate(expense.date)}</div>
        <h2 className={s.title}>{expense.title}</h2>
        <div className={`${s.amount} num`}>{yen(expense.amount)}</div>
      </section>

      <section className={s.memo}>
        <h3 className={s.memoTitle}>なぜ、この対応をしたか</h3>
        {expense.memo ? (
          <p>{expense.memo}</p>
        ) : (
          <p className={s.empty}>
            書かれていません。思い出せることがあれば、下の「この内容を書きかえる」から足せます。
          </p>
        )}
      </section>

      {photos.length > 0 && (
        <>
          <h3 className={s.groupTitle}>写真</h3>
          <ul className={s.photos}>
            {photos.map((photo) => (
              <li key={photo.id}>
                <Picture photo={photo} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className={s.groupTitle}>くわしく</h3>
      <dl className={s.list}>
        <dt>対象</dt>
        <dd>{room ? `${room.roomNo}号室` : '建物全体'}</dd>
        <dt>種類</dt>
        <dd>{KIND_LABEL[expense.kind]}</dd>
        {expense.vendor && (
          <>
            <dt>頼んだ先</dt>
            <dd>{expense.vendor}</dd>
          </>
        )}
      </dl>

      <div className={s.actions}>
        <Link to={`/expenses/${expense.id}/edit`}>この内容を書きかえる</Link>
        {confirming ? (
          <div className={s.confirm}>
            <p>この記録と写真を消します。もとに戻せません。</p>
            <button className={s.delete} onClick={() => void handleDelete()} disabled={busy}>
              {busy ? '消しています…' : 'はい、消します'}
            </button>
            <button onClick={() => setConfirming(false)} disabled={busy}>
              やめる
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}>この記録を消す</button>
        )}
      </div>
    </Screen>
  )
}

/** 画面から消えるときに、必ず後片づけする（解放しないとメモリを食い続ける） */
function Picture({ photo }: { photo: PickedPhoto }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo.blob])

  return <img src={url} alt="" width={photo.width} height={photo.height} />
}

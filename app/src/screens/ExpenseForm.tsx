import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Field } from '../components/Field'
import { PhotoPicker } from '../components/PhotoPicker'
import { Screen } from '../components/Screen'
import { VoiceMemo } from '../components/VoiceMemo'
import { db, type ExpenseKind } from '../db'
import { addDays, today } from '../lib/date'
import { createExpense, updateExpense, type ExpenseInput } from '../lib/expenses'
import { commitPhotos, loadPhotos, type PickedPhoto } from '../lib/photos'
import s from './ExpenseForm.module.css'

/**
 * 費用の記録（新しく記録する・書きかえる）
 *
 * できるだけ**ボタンを押すだけ**で入るようにしてある。
 * 打つ必要があるのは、件名・金額・頼んだ先・メモだけ。
 */

function toInt(value: string): number {
  const n = Number(value.replace(/[^0-9-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export default function ExpenseForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()

  const [date, setDate] = useState(today())
  const [roomId, setRoomId] = useState('')
  const [kind, setKind] = useState<ExpenseKind>('repair')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [memo, setMemo] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [before, setBefore] = useState<string[]>([])

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(!editing)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  const rooms = useLiveQuery(
    async () => (await db.rooms.toArray()).filter((r) => !r.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
    [],
  )

  useEffect(() => {
    if (!id) return
    let alive = true
    void (async () => {
      const expense = await db.expenses.get(id)
      if (!expense) {
        if (alive) setFailed('その記録が見つかりませんでした。')
        return
      }
      const saved = await loadPhotos(expense.photoIds)
      if (!alive) return
      setDate(expense.date)
      setRoomId(expense.roomId ?? '')
      setKind(expense.kind)
      setTitle(expense.title)
      setAmount(String(expense.amount))
      setVendor(expense.vendor ?? '')
      setMemo(expense.memo ?? '')
      setPhotos(saved)
      setBefore(expense.photoIds)
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!date) found.date = '日付を入れてください'
    if (!title.trim()) found.title = '何をしたか、短く入れてください（例：給湯器の交換）'
    if (toInt(amount) <= 0) found.amount = '金額を入れてください'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    setFailed('')
    try {
      const photoIds = await commitPhotos(before, photos)
      const input: ExpenseInput = {
        kind, date, title, amount: toInt(amount), vendor,
        roomId: roomId || undefined, photoIds, memo,
      }
      if (id) {
        await updateExpense(id, input)
        navigate(`/expenses/${id}`)
      } else {
        navigate(`/expenses/${await createExpense(input)}`)
      }
    } catch {
      setFailed('保存できませんでした。もう一度お試しください。')
      setBusy(false)
    }
  }

  const back = id ? `/expenses/${id}` : '/expenses'

  return (
    <Screen
      title={editing ? '記録を書きかえる' : '新しく記録する'}
      back={back}
      backLabel="やめて、もどる"
    >
      {!loaded ? (
        <p className={s.note}>{failed || '読み込んでいます…'}</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Field label="1. いつのことですか" required error={errors.date}>
            {(fieldId) => (
              <>
                <div className={s.choices}>
                  <button type="button" aria-pressed={date === today()}
                    onClick={() => setDate(today())}>今日</button>
                  <button type="button" aria-pressed={date === addDays(today(), -1)}
                    onClick={() => setDate(addDays(today(), -1))}>昨日</button>
                </div>
                <input id={fieldId} className={s.spaced} type="date" value={date}
                  onChange={(e) => setDate(e.target.value)} />
              </>
            )}
          </Field>

          <Field label="2. どこですか" hint="建物ぜんたいのこと（保険・税金など）なら「建物全体」のままで結構です">
            {() => (
              <div className={`${s.choices} ${s.rooms}`}>
                <button type="button" aria-pressed={roomId === ''}
                  onClick={() => setRoomId('')}>建物全体</button>
                {rooms.map((room) => (
                  <button key={room.id} type="button" aria-pressed={roomId === room.id}
                    onClick={() => setRoomId(room.id)}>{room.roomNo}</button>
                ))}
              </div>
            )}
          </Field>

          <Field label="3. 種類">
            {() => (
              <div className={s.choices}>
                <button type="button" aria-pressed={kind === 'repair'}
                  onClick={() => setKind('repair')}>修繕</button>
                <button type="button" aria-pressed={kind === 'fixed'}
                  onClick={() => setKind('fixed')}>固定費</button>
              </div>
            )}
          </Field>

          <Field label="4. 何をしましたか" required error={errors.title}>
            {(fieldId) => (
              <input id={fieldId} type="text" value={title}
                onChange={(e) => setTitle(e.target.value)} placeholder="給湯器の交換" />
            )}
          </Field>

          <Field label="5. 金額（円）" required error={errors.amount}>
            {(fieldId) => (
              <input id={fieldId} type="text" inputMode="numeric" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="128000" />
            )}
          </Field>

          <Field label="6. 頼んだ先">
            {(fieldId) => (
              <input id={fieldId} type="text" value={vendor}
                onChange={(e) => setVendor(e.target.value)} placeholder="山田設備（0000-11-2222）" />
            )}
          </Field>

          <Field label="7. 写真" hint="修繕したところ、領収書、書類など。あとから足すこともできます。">
            {() => <PhotoPicker photos={photos} onChange={setPhotos} />}
          </Field>

          <Field
            label="8. なぜ、この対応をしましたか"
            hint="あとで見る家族が、いちばん知りたいところです。思い出せることを、話すように書いてください。空欄でもかまいません。"
          >
            {(fieldId) => (
              <VoiceMemo
                id={fieldId}
                value={memo}
                onChange={setMemo}
                placeholder="例）お湯の出が悪いと言われていた。修理では直らないと業者に言われたので、退去のタイミングで新品に交換した。"
              />
            )}
          </Field>

          {Object.keys(errors).length > 0 && (
            <p className={s.failed}>入っていない欄があります。赤い文字のところを見てください。</p>
          )}
          {failed && <p className={s.failed}>{failed}</p>}

          <button className={s.save} type="submit" disabled={busy}>
            {busy ? '保存しています…' : editing ? 'この内容で書きかえる' : 'この内容で記録する'}
          </button>
        </form>
      )}
    </Screen>
  )
}

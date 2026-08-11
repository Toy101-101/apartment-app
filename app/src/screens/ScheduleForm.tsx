import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { db, type ScheduleKind } from '../db'
import { isRealDate, today } from '../lib/date'
import {
  createSchedule, KIND_LABEL, removeSchedule, TEMPLATES, updateSchedule,
} from '../lib/schedules'
import s from './ScheduleForm.module.css'

/**
 * 年間の予定の登録と書きかえ
 *
 * 「火災保険の更新」を自分で打ち込むのは、それだけで手が止まる。
 * よくある予定をボタンで選べるようにして、**日付だけ入れれば終わる**ようにしてある。
 * 何か月ごとか・何日前に知らせるかも、押すだけで決まる。
 */

const KINDS: ScheduleKind[] = ['insurance', 'tax', 'inspection', 'other']

const EVERY: { months: number; label: string }[] = [
  { months: 12, label: '年1回' },
  { months: 6, label: '年2回' },
  { months: 3, label: '年4回' },
  { months: 0, label: '1回きり' },
]

const NOTICE: { days: number; label: string }[] = [
  { days: 30, label: '30日前' },
  { days: 60, label: '60日前' },
  { days: 90, label: '90日前' },
]

export default function ScheduleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ScheduleKind>('insurance')
  const [nextDate, setNextDate] = useState(today())
  const [everyMonths, setEveryMonths] = useState(12)
  const [noticeDays, setNoticeDays] = useState(60)
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(!editing)

  useEffect(() => {
    if (!editing) return
    void (async () => {
      const row = await db.schedules.get(id)
      if (!row) {
        setError('その予定が見つかりませんでした。')
        setLoaded(true)
        return
      }
      setTitle(row.title)
      setKind(row.kind)
      setNextDate(row.nextDate)
      setEveryMonths(row.everyMonths)
      setNoticeDays(row.noticeDays)
      setAmount(row.amount ? String(row.amount) : '')
      setVendor(row.vendor ?? '')
      setMemo(row.memo ?? '')
      setLoaded(true)
    })()
  }, [editing, id])

  function useTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title)
    setKind(t.kind)
    setEveryMonths(t.everyMonths)
    setNoticeDays(t.noticeDays)
  }

  async function save() {
    if (!title.trim()) {
      setError('何の予定かを入れてください。')
      return
    }
    if (!isRealDate(nextDate)) {
      setError('次にする日を入れてください。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const yenAmount = Number(amount.replace(/[^0-9]/g, ''))
      const input = {
        title, kind, nextDate, everyMonths, noticeDays,
        amount: yenAmount > 0 ? yenAmount : undefined,
        vendor, memo,
      }
      if (editing) await updateSchedule(id, input)
      else await createSchedule(input)
      navigate('/schedules')
    } catch {
      setError('保存できませんでした。もう一度お試しください。')
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    await removeSchedule(id)
    navigate('/schedules')
  }

  if (!loaded) {
    return (
      <Screen title="予定" back="/schedules" backLabel="一覧にもどる">
        <p>読み込んでいます…</p>
      </Screen>
    )
  }

  return (
    <Screen
      title={editing ? '予定を直す' : '予定を足す'}
      back="/schedules"
      backLabel="一覧にもどる"
    >
      {!editing && (
        <section className={s.templates}>
          <h2 className={s.templatesTitle}>よくある予定から選ぶ</h2>
          <p className={s.templatesNote}>
            押すと名前と回数が入ります。あとは日にちを入れるだけです。
          </p>
          <div className={s.chips}>
            {TEMPLATES.map((t) => (
              <button key={t.title} onClick={() => useTemplate(t)}>
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <Field label="何の予定か" required>
        {(fieldId) => (
          <input
            id={fieldId}
            type="text"
            value={title}
            placeholder="火災保険の更新"
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>

      <Field label="種類">
        {() => (
          <div className={s.choices}>
            {KINDS.map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="次にする日" hint="納期や更新日です。過ぎていても入れて構いません" required>
        {(fieldId) => (
          <input
            id={fieldId}
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
        )}
      </Field>

      <Field label="どのくらいの間隔で来るか" hint="済ませると、この間隔で次の日にちが入ります">
        {() => (
          <div className={s.choices}>
            {EVERY.map((e) => (
              <button
                key={e.months}
                aria-pressed={everyMonths === e.months}
                onClick={() => setEveryMonths(e.months)}
              >
                {e.label}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="何日前から知らせるか" hint="この日数まで近づくと、ホームに出ます">
        {() => (
          <div className={s.choices}>
            {NOTICE.map((n) => (
              <button
                key={n.days}
                aria-pressed={noticeDays === n.days}
                onClick={() => setNoticeDays(n.days)}
              >
                {n.label}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="だいたいの金額" hint="分からなければ空のままで結構です">
        {(fieldId) => (
          <input
            id={fieldId}
            className="num"
            type="text"
            inputMode="numeric"
            value={amount}
            placeholder="48000"
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
      </Field>

      <Field label="保険会社・業者・納付先">
        {(fieldId) => (
          <input
            id={fieldId}
            type="text"
            value={vendor}
            placeholder="□□損保"
            onChange={(e) => setVendor(e.target.value)}
          />
        )}
      </Field>

      <Field label="覚え書き" hint="毎回どうしているか、誰に頼んでいるかを残しておくと、あとで助かります">
        {(fieldId) => (
          <textarea id={fieldId} value={memo} onChange={(e) => setMemo(e.target.value)} />
        )}
      </Field>

      {error && <p className={s.error}>{error}</p>}

      <button className={s.primary} onClick={() => void save()} disabled={busy}>
        {busy ? '保存しています…' : '保存する'}
      </button>

      {editing && (
        <ConfirmDelete
          label="この予定を消す"
          warning={`消すと、ホームのお知らせにも出なくなります。
            火災保険や税金の納期は、落とすと取り返しがつきません。
            もう来ないものでなければ、消さずに「次にする日」を直すほうが安全です。`}
          busy={busy}
          onConfirm={() => void remove()}
        />
      )}
    </Screen>
  )
}

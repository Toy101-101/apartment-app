import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { db } from '../db'
import {
  addNote, cancelEndLease, changeRent, endLease, removeNote, renewLease, renewalText, sortNotes,
} from '../lib/contracts'
import { formatDate, formatMonth, today, yen } from '../lib/date'
import { monthOf, renewalLevel } from '../lib/rent'
import s from './ContractDetail.module.css'

/**
 * 契約の詳細
 *
 * ここが「アーカイブ」の中身そのもの。金額よりも、
 * 家賃の履歴（なぜ下げたか）と、いきさつメモが主役になるように置いている。
 *
 * 手を入れる操作は4つだけ。どれも前の記録を消さない。
 *   書きかえる（書きまちがいを直す）／家賃を変える／契約を更新する／退去にする
 */

type Panel = 'rent' | 'renew' | 'end' | 'note' | null

function toInt(value: string): number {
  const n = Number(value.replace(/[^0-9-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    if (!id) return null
    const lease = await db.leases.get(id)
    if (!lease) return null
    const [room, tenant, terms, notes] = await Promise.all([
      db.rooms.get(lease.roomId),
      db.tenants.get(lease.tenantId),
      db.rentTerms.where('leaseId').equals(lease.id).toArray(),
      db.notes.where('[targetType+targetId]').equals(['lease', lease.id]).toArray(),
    ])
    return {
      lease,
      room,
      tenant,
      // 新しい順。いまの家賃がいちばん上にくる
      terms: terms.filter((t) => !t.deletedAt).sort((a, b) => b.fromMonth.localeCompare(a.fromMonth)),
      notes: sortNotes(notes),
    }
  }, [id])

  if (data === undefined) {
    return <Screen title="契約" back="/contracts"><p className={s.note}>読み込んでいます…</p></Screen>
  }
  if (data === null) {
    return (
      <Screen title="契約" back="/contracts" backLabel="一覧にもどる">
        <p className={s.note}>その契約が見つかりませんでした。</p>
      </Screen>
    )
  }

  const { lease, room, tenant, terms, notes } = data
  const end = lease.movedOutOn ?? lease.endDate
  const living = end >= today()
  const { days } = renewalLevel(lease.endDate)
  const current = terms[0]

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      setPanel(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={`${room?.roomNo ?? ''}号室`}
      back="/contracts"
      backLabel="一覧にもどる"
    >
      <section className={`${s.head} ${living ? '' : s.endedHead}`}>
        <div className={s.name}>{tenant?.name ?? '（名前なし）'}</div>
        <div className={s.kana}>{tenant?.kana}</div>
        <div className={s.renewal}>{renewalText(living, days)}</div>
      </section>

      {tenant?.contactNote && (
        <section className={s.contact}>
          <h2 className={s.contactTitle}>連絡のしかた</h2>
          <p>{tenant.contactNote}</p>
        </section>
      )}

      <h2 className={s.groupTitle}>この方のこと</h2>
      <dl className={s.list}>
        <Row label="電話" value={tenant?.phone} tel />
        <Row label="保証人" value={tenant?.guarantorName} />
        <Row label="保証人の電話" value={tenant?.guarantorPhone} tel />
      </dl>

      <h2 className={s.groupTitle}>契約</h2>
      <dl className={s.list}>
        <Row label="始まった日" value={formatDate(lease.startDate)} />
        <Row label="終わる日" value={formatDate(lease.endDate)} />
        {lease.movedOutOn && <Row label="退去した日" value={formatDate(lease.movedOutOn)} />}
        <Row label="敷金" value={yen(lease.deposit)} />
        <Row label="礼金" value={yen(lease.keyMoney)} />
      </dl>

      <h2 className={s.groupTitle}>家賃</h2>
      {current ? (
        <p className={s.bigRent}>
          <b className="num">{yen(current.rent + current.mgmtFee)}</b>
          <span>／月（家賃 {yen(current.rent)}＋管理費 {yen(current.mgmtFee)}）</span>
        </p>
      ) : (
        <p className={s.note}>家賃がまだ入っていません。</p>
      )}

      {terms.length > 1 && (
        <>
          <h3 className={s.subTitle}>これまでの家賃</h3>
          <ul className={s.terms}>
            {terms.map((t) => (
              <li key={t.id}>
                <div>
                  <span className="num">{formatMonth(t.fromMonth)}から</span>
                  <b className="num">{yen(t.rent + t.mgmtFee)}</b>
                </div>
                {t.reason && <p className={s.reason}>{t.reason}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={s.groupTitle}>いきさつメモ</h2>
      {notes.length === 0 && <p className={s.note}>まだありません。</p>}
      <ul className={s.notes}>
        {notes.map((n) => (
          <li key={n.id}>
            <div className={s.noteHead}>
              <span className="num">{formatDate(n.date)}</span>
              {n.author && <span>{n.author}</span>}
            </div>
            <p className={s.noteBody}>{n.body}</p>
            <button className={s.noteDelete} onClick={() => void run(() => removeNote(n.id))}>
              このメモを消す
            </button>
          </li>
        ))}
      </ul>

      <h2 className={s.groupTitle}>手を入れる</h2>
      <div className={s.actions}>
        <button onClick={() => setPanel(panel === 'note' ? null : 'note')}>メモを足す</button>
        <Link to={`/contracts/${lease.id}/edit`}>書きまちがいを直す</Link>
        <button onClick={() => setPanel(panel === 'rent' ? null : 'rent')}>家賃を変える</button>
        <button onClick={() => setPanel(panel === 'renew' ? null : 'renew')}>契約を更新する</button>
        {lease.movedOutOn ? (
          <button onClick={() => void run(() => cancelEndLease(lease.id))} disabled={busy}>
            退去を取り消す
          </button>
        ) : (
          <button onClick={() => setPanel(panel === 'end' ? null : 'end')}>退去にする</button>
        )}
      </div>

      {panel === 'note' && (
        <NotePanel busy={busy} onSave={(body, author) =>
          run(() => addNote({ targetType: 'lease', targetId: lease.id, body, author }))} />
      )}

      {panel === 'rent' && current && (
        <RentPanel
          busy={busy}
          rent={current.rent}
          mgmtFee={current.mgmtFee}
          onSave={(fromMonth, rent, mgmtFee, reason) =>
            run(() => changeRent(lease.id, { fromMonth, rent, mgmtFee, reason }))}
        />
      )}

      {panel === 'renew' && (
        <RenewPanel
          busy={busy}
          startsOn={lease.endDate}
          rent={current?.rent ?? 0}
          mgmtFee={current?.mgmtFee ?? 0}
          onSave={async (endDate, rent, mgmtFee, reason) => {
            const next = await renewLease(lease.id, { endDate, rent, mgmtFee, reason })
            setPanel(null)
            navigate(`/contracts/${next}`)
          }}
        />
      )}

      {panel === 'end' && (
        <EndPanel busy={busy} onSave={(date) => run(() => endLease(lease.id, date))} />
      )}
    </Screen>
  )
}

function Row({ label, value, tel }: { label: string; value?: string; tel?: boolean }) {
  if (!value) return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{tel ? <a href={`tel:${value.replace(/[^0-9+]/g, '')}`}>{value}</a> : value}</dd>
    </>
  )
}

function NotePanel({ busy, onSave }: {
  busy: boolean
  onSave: (body: string, author: string) => void
}) {
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState('')
  return (
    <section className={s.panel}>
      <h3 className={s.panelTitle}>メモを足す</h3>
      <Field label="内容"
        hint="文字を打つのが手間なら、キーボードのマイクを押して話しても入れられます。">
        {(id) => <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <Field label="書いた人">
        {(id) => (
          <input id={id} type="text" value={author}
            onChange={(e) => setAuthor(e.target.value)} placeholder="祖父" />
        )}
      </Field>
      <button className={s.panelSave} disabled={busy || !body.trim()}
        onClick={() => onSave(body, author)}>
        このメモを残す
      </button>
    </section>
  )
}

function RentPanel({ busy, rent, mgmtFee, onSave }: {
  busy: boolean
  rent: number
  mgmtFee: number
  onSave: (fromMonth: string, rent: number, mgmtFee: number, reason: string) => void
}) {
  const [fromMonth, setFromMonth] = useState(monthOf(today()))
  const [newRent, setNewRent] = useState(String(rent))
  const [newFee, setNewFee] = useState(String(mgmtFee))
  const [reason, setReason] = useState('')

  return (
    <section className={s.panel}>
      <h3 className={s.panelTitle}>家賃を変える</h3>
      <p className={s.panelNote}>
        いまの額は消えません。「この月分から新しい額にする」という記録が足されるだけなので、
        過去の月をひらけば当時の額のまま出ます。
      </p>
      <Field label="この月分から">
        {(id) => (
          <input id={id} type="month" value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)} />
        )}
      </Field>
      <Field label="新しい家賃">
        {(id) => (
          <input id={id} type="text" inputMode="numeric" value={newRent}
            onChange={(e) => setNewRent(e.target.value)} />
        )}
      </Field>
      <Field label="新しい管理費">
        {(id) => (
          <input id={id} type="text" inputMode="numeric" value={newFee}
            onChange={(e) => setNewFee(e.target.value)} />
        )}
      </Field>
      <Field label="変える理由"
        hint="ここがいちばん大事です。例：長く住んでもらっているので2,000円下げた">
        {(id) => <textarea id={id} rows={3} value={reason}
          onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <button className={s.panelSave} disabled={busy || !fromMonth}
        onClick={() => onSave(fromMonth, toInt(newRent), toInt(newFee), reason)}>
        家賃を変える
      </button>
    </section>
  )
}

function RenewPanel({ busy, startsOn, rent, mgmtFee, onSave }: {
  busy: boolean
  startsOn: string
  rent: number
  mgmtFee: number
  onSave: (endDate: string, rent: number, mgmtFee: number, reason: string) => void
}) {
  const [endDate, setEndDate] = useState('')
  const [newRent, setNewRent] = useState(String(rent))
  const [newFee, setNewFee] = useState(String(mgmtFee))
  const [reason, setReason] = useState('')

  return (
    <section className={s.panel}>
      <h3 className={s.panelTitle}>契約を更新する</h3>
      <p className={s.panelNote}>
        いまの契約（{formatDate(startsOn)}まで）はそのまま残し、その翌日から始まる
        新しい契約を作ります。家賃を据え置くなら、そのままで結構です。
      </p>
      <Field label="新しい契約が終わる日" required>
        {(id) => (
          <input id={id} type="date" value={endDate}
            onChange={(e) => setEndDate(e.target.value)} />
        )}
      </Field>
      <Field label="新しい家賃">
        {(id) => (
          <input id={id} type="text" inputMode="numeric" value={newRent}
            onChange={(e) => setNewRent(e.target.value)} />
        )}
      </Field>
      <Field label="新しい管理費">
        {(id) => (
          <input id={id} type="text" inputMode="numeric" value={newFee}
            onChange={(e) => setNewFee(e.target.value)} />
        )}
      </Field>
      <Field label="更新のいきさつ" hint="例：長く住んでもらっているので据え置いた">
        {(id) => <textarea id={id} rows={3} value={reason}
          onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <button className={s.panelSave} disabled={busy || !endDate}
        onClick={() => onSave(endDate, toInt(newRent), toInt(newFee), reason)}>
        更新して、新しい契約を作る
      </button>
    </section>
  )
}

function EndPanel({ busy, onSave }: { busy: boolean; onSave: (date: string) => void }) {
  const [date, setDate] = useState(today())
  return (
    <section className={s.panel}>
      <h3 className={s.panelTitle}>退去にする</h3>
      <p className={s.panelNote}>
        契約は消えません。この日で終わったことにするだけです。
        まちがえても、あとから取り消せます。
      </p>
      <Field label="退去した日" required>
        {(id) => (
          <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </Field>
      <button className={s.panelSave} disabled={busy || !date} onClick={() => onSave(date)}>
        この日で退去にする
      </button>
    </section>
  )
}

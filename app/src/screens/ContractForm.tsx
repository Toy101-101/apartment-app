import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { addNote, createContract, updateContract, type ContractInput } from '../lib/contracts'
import { monthOf, rentTermFor } from '../lib/rent'
import s from './ContractForm.module.css'

/**
 * 契約の登録と書きかえ
 *
 * 書きかえは「書きまちがいを直す」ためのもの。
 * 家賃はここでは動かさない（下げた理由まで消えてしまうため、詳細の「家賃を変える」を使う）。
 */

type Form = Record<string, string>

const EMPTY: Form = {
  roomNo: '', name: '', kana: '', phone: '',
  guarantorName: '', guarantorPhone: '', contactNote: '',
  startDate: '', endDate: '', deposit: '', keyMoney: '',
  rent: '', mgmtFee: '', note: '', author: '',
}

/** '55,000円' のように入れられても、整数の円として読む */
function toInt(value: string): number {
  const n = Number(value.replace(/[^0-9-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

function validate(form: Form, editing: boolean): Form {
  const errors: Form = {}
  if (!form.roomNo.trim()) errors.roomNo = '部屋番号を入れてください（例：101）'
  if (!form.name.trim()) errors.name = 'お名前を入れてください'
  if (!form.kana.trim()) errors.kana = 'ふりがなを入れてください'
  if (!form.startDate) errors.startDate = '契約が始まった日を入れてください'
  if (!form.endDate) errors.endDate = '契約が終わる日を入れてください'
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.endDate = '契約が終わる日は、始まった日より後にしてください'
  }
  if (!editing && toInt(form.rent) <= 0) errors.rent = '家賃を入れてください'
  return errors
}

export default function ContractForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()

  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Form>({})
  const [loaded, setLoaded] = useState(!editing)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  // 書きかえのときは、いまの中身を読み込んでから出す
  useEffect(() => {
    if (!id) return
    let alive = true
    void (async () => {
      const lease = await db.leases.get(id)
      if (!lease) {
        if (alive) setFailed('その契約が見つかりませんでした。')
        return
      }
      const [room, tenant, terms] = await Promise.all([
        db.rooms.get(lease.roomId),
        db.tenants.get(lease.tenantId),
        db.rentTerms.where('leaseId').equals(lease.id).toArray(),
      ])
      const term = rentTermFor(terms, monthOf(lease.endDate))
      if (!alive) return
      setForm({
        ...EMPTY,
        roomNo: room?.roomNo ?? '',
        name: tenant?.name ?? '',
        kana: tenant?.kana ?? '',
        phone: tenant?.phone ?? '',
        guarantorName: tenant?.guarantorName ?? '',
        guarantorPhone: tenant?.guarantorPhone ?? '',
        contactNote: tenant?.contactNote ?? '',
        startDate: lease.startDate,
        endDate: lease.endDate,
        deposit: String(lease.deposit),
        keyMoney: String(lease.keyMoney),
        rent: String(term?.rent ?? 0),
        mgmtFee: String(term?.mgmtFee ?? 0),
      })
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [id])

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found = validate(form, editing)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const input: ContractInput = {
      roomNo: form.roomNo,
      name: form.name,
      kana: form.kana,
      phone: form.phone,
      guarantorName: form.guarantorName,
      guarantorPhone: form.guarantorPhone,
      contactNote: form.contactNote,
      startDate: form.startDate,
      endDate: form.endDate,
      deposit: toInt(form.deposit),
      keyMoney: toInt(form.keyMoney),
      rent: toInt(form.rent),
      mgmtFee: toInt(form.mgmtFee),
    }

    setBusy(true)
    setFailed('')
    try {
      if (id) {
        await updateContract(id, input)
        navigate(`/contracts/${id}`)
      } else {
        const leaseId = await createContract(input)
        if (form.note.trim()) {
          await addNote({
            targetType: 'lease', targetId: leaseId,
            body: form.note, author: form.author,
          })
        }
        navigate(`/contracts/${leaseId}`)
      }
    } catch {
      setFailed('保存できませんでした。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  const back = id ? `/contracts/${id}` : '/contracts'

  return (
    <Screen
      title={editing ? '契約を書きかえる' : '新しい契約を登録する'}
      back={back}
      backLabel="やめて、もどる"
    >
      {!loaded ? (
        <p className={s.note}>{failed || '読み込んでいます…'}</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <h2 className={s.groupTitle}>部屋</h2>
          <Field label="部屋番号" required error={errors.roomNo}
            hint="はじめて出てくる番号なら、その部屋も一緒に作ります">
            {(id) => (
              <input id={id} type="text" inputMode="numeric" value={form.roomNo}
                onChange={(e) => set('roomNo')(e.target.value)} placeholder="101" />
            )}
          </Field>

          <h2 className={s.groupTitle}>入居者</h2>
          <Field label="お名前" required error={errors.name}>
            {(id) => (
              <input id={id} type="text" value={form.name}
                onChange={(e) => set('name')(e.target.value)} placeholder="田中 一郎" />
            )}
          </Field>
          <Field label="ふりがな" required error={errors.kana}>
            {(id) => (
              <input id={id} type="text" value={form.kana}
                onChange={(e) => set('kana')(e.target.value)} placeholder="たなか いちろう" />
            )}
          </Field>
          <Field label="電話番号">
            {(id) => (
              <input id={id} type="tel" value={form.phone}
                onChange={(e) => set('phone')(e.target.value)} placeholder="090-1234-5678" />
            )}
          </Field>
          <Field label="保証人の名前">
            {(id) => (
              <input id={id} type="text" value={form.guarantorName}
                onChange={(e) => set('guarantorName')(e.target.value)} placeholder="田中 幸子（妻）" />
            )}
          </Field>
          <Field label="保証人の電話番号">
            {(id) => (
              <input id={id} type="tel" value={form.guarantorPhone}
                onChange={(e) => set('guarantorPhone')(e.target.value)} />
            )}
          </Field>
          <Field
            label="連絡のしかた"
            hint="契約書には書かれない、頭の中にしかないこと。引き継ぎで最初に失われるので、ここに残します。例：耳が遠いので手紙が確実／夜勤で日中は不在"
          >
            {(id) => (
              <textarea id={id} value={form.contactNote}
                onChange={(e) => set('contactNote')(e.target.value)} rows={3} />
            )}
          </Field>

          <h2 className={s.groupTitle}>契約</h2>
          <Field label="契約が始まった日" required error={errors.startDate}>
            {(id) => (
              <input id={id} type="date" value={form.startDate}
                onChange={(e) => set('startDate')(e.target.value)} />
            )}
          </Field>
          <Field label="契約が終わる日" required error={errors.endDate}
            hint="この日の60日前と30日前に、ホームでお知らせします">
            {(id) => (
              <input id={id} type="date" value={form.endDate}
                onChange={(e) => set('endDate')(e.target.value)} />
            )}
          </Field>
          <div className={s.two}>
            <Field label="敷金">
              {(id) => (
                <input id={id} type="text" inputMode="numeric" value={form.deposit}
                  onChange={(e) => set('deposit')(e.target.value)} placeholder="110000" />
              )}
            </Field>
            <Field label="礼金">
              {(id) => (
                <input id={id} type="text" inputMode="numeric" value={form.keyMoney}
                  onChange={(e) => set('keyMoney')(e.target.value)} placeholder="55000" />
              )}
            </Field>
          </div>

          <h2 className={s.groupTitle}>家賃</h2>
          {editing ? (
            <p className={s.locked}>
              家賃はここでは変えません。変えた額と理由を残すため、
              ひとつ前の画面の「家賃を変える」からお願いします。
            </p>
          ) : (
            <div className={s.two}>
              <Field label="家賃（月）" required error={errors.rent}>
                {(id) => (
                  <input id={id} type="text" inputMode="numeric" value={form.rent}
                    onChange={(e) => set('rent')(e.target.value)} placeholder="55000" />
                )}
              </Field>
              <Field label="管理費（月）">
                {(id) => (
                  <input id={id} type="text" inputMode="numeric" value={form.mgmtFee}
                    onChange={(e) => set('mgmtFee')(e.target.value)} placeholder="3000" />
                )}
              </Field>
            </div>
          )}

          {!editing && (
            <>
              <h2 className={s.groupTitle}>契約のいきさつ</h2>
              <Field
                label="メモ"
                hint="なぜこの家賃にしたか、どういう経緯で入居されたか。あとで読む家族のために残します。文字を打つのが手間なら、キーボードのマイクで話しても入れられます。"
              >
                {(id) => (
                  <textarea id={id} value={form.note}
                    onChange={(e) => set('note')(e.target.value)} />
                )}
              </Field>
              <Field label="書いた人">
                {(id) => (
                  <input id={id} type="text" value={form.author}
                    onChange={(e) => set('author')(e.target.value)} placeholder="祖父" />
                )}
              </Field>
            </>
          )}

          {Object.keys(errors).length > 0 && (
            <p className={s.failed}>入っていない欄があります。赤い文字のところを見てください。</p>
          )}
          {failed && <p className={s.failed}>{failed}</p>}

          <button className={s.save} type="submit" disabled={busy}>
            {busy ? '保存しています…' : editing ? 'この内容で書きかえる' : 'この内容で登録する'}
          </button>
        </form>
      )}
    </Screen>
  )
}

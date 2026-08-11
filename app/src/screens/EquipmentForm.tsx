import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { db, type EquipmentKind } from '../db'
import { isRealDate, isRealMonth, monthKey, today } from '../lib/date'
import {
  ageInMonths, ageText, createEquipment, DEFAULT_LIFE_YEARS, KIND_LABEL,
  removeEquipment, replaceEquipment, updateEquipment,
} from '../lib/equipment'
import s from './EquipmentForm.module.css'

/**
 * 設備の登録・書きかえ・取り替え
 *
 * 3つとも入れる項目がほとんど同じなので、1つの画面にまとめてある。
 * 取り替えのときだけ、前のものが何年もったかを先に見せる。
 * それが「次はもう少し良いものにする」といった判断の材料になる。
 */

const KINDS: EquipmentKind[] = ['waterHeater', 'aircon', 'other']

/** 設置年月の欄は 'YYYY-MM'。type="month" が使えない端末のために、文字でも受ける */
export default function EquipmentForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  // HashRouter でも pathname は '#' の後ろを指すので、これで取り替え画面か分かる
  const replacing = useLocation().pathname.endsWith('/replace')
  const editing = id !== undefined && !replacing

  const rooms = useLiveQuery(
    async () => (await db.rooms.toArray()).filter((r) => !r.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  )

  const [kind, setKind] = useState<EquipmentKind>('waterHeater')
  const [roomId, setRoomId] = useState('')
  const [installedOn, setInstalledOn] = useState(monthKey(new Date()))
  const [lifeYears, setLifeYears] = useState(DEFAULT_LIFE_YEARS.waterHeater)
  const [maker, setMaker] = useState('')
  const [model, setModel] = useState('')
  const [memo, setMemo] = useState('')

  /** 取り替えのときだけ使う */
  const [replacedOn, setReplacedOn] = useState(today())
  const [amount, setAmount] = useState('')
  const [lasted, setLasted] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(id === undefined)

  useEffect(() => {
    if (id === undefined) return
    void (async () => {
      const row = await db.equipment.get(id)
      if (!row) {
        setError('その設備が見つかりませんでした。')
        setLoaded(true)
        return
      }
      setKind(row.kind)
      setRoomId(row.roomId ?? '')
      setLifeYears(row.lifeYears)
      if (replacing) {
        // 取り替えでは、新しいものの中身を入れてもらう。前のものの年式は引き継がない
        setInstalledOn(monthKey(new Date()))
        setLasted(ageText(ageInMonths(row.installedOn, today())))
      } else {
        setInstalledOn(row.installedOn)
        setMaker(row.maker ?? '')
        setModel(row.model ?? '')
        setMemo(row.memo ?? '')
      }
      setLoaded(true)
    })()
  }, [id, replacing])

  /** 種類を変えたら、もつ年数の目安も一緒に入れ替える（登録のときだけ） */
  function chooseKind(k: EquipmentKind) {
    setKind(k)
    if (id === undefined) setLifeYears(DEFAULT_LIFE_YEARS[k])
  }

  async function save() {
    if (!isRealMonth(installedOn)) {
      setError('設置した年月を「2014-04」のように入れてください。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const input = {
        kind,
        roomId: roomId || undefined,
        installedOn,
        lifeYears,
        maker,
        model,
        memo,
      }
      if (editing) await updateEquipment(id, input)
      else await createEquipment(input)
      navigate('/equipment')
    } catch {
      setError('保存できませんでした。もう一度お試しください。')
      setBusy(false)
    }
  }

  async function replace() {
    if (id === undefined) return
    // ここを確かめずに通すと、日付が空のまま保存され、新しい行の設置年月が空になる。
    // 一覧の年数が「NaN」になり、③修繕・費用に日付の無い記録まで残ってしまう
    if (!isRealDate(replacedOn)) {
      setError('取り替えた日を入れてください。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const yenAmount = Number(amount.replace(/[^0-9]/g, ''))
      await replaceEquipment(id, {
        date: replacedOn,
        amount: yenAmount > 0 ? yenAmount : undefined,
        lifeYears,
        maker, model, memo,
      })
      navigate('/equipment')
    } catch {
      setError('記録できませんでした。もう一度お試しください。')
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    await removeEquipment(id)
    navigate('/equipment')
  }

  if (!loaded) {
    return (
      <Screen title="設備" back="/equipment" backLabel="一覧にもどる">
        <p>読み込んでいます…</p>
      </Screen>
    )
  }

  const title = replacing ? '取り替えたことを記録する' : editing ? '設備を直す' : '設備を足す'

  return (
    <Screen title={title} back="/equipment" backLabel="一覧にもどる">
      {replacing && (
        <section className={s.lasted}>
          <p className={s.lastedText}>
            前の{KIND_LABEL[kind]}は <b>{lasted}</b> もちました。
          </p>
          <p className={s.lastedNote}>
            この記録は消えません。次に替えるときの目安になります。
            ここから先は、<b>新しく付けたもの</b>を入れてください。
          </p>
        </section>
      )}

      <Field label="何の設備か">
        {() => (
          <div className={s.choices}>
            {KINDS.map((k) => (
              <button
                key={k}
                aria-pressed={kind === k}
                disabled={replacing}
                onClick={() => chooseKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="どこにあるか" hint="受水槽や共用部のものは「建物全体」を選びます">
        {(fieldId) => (
          <select
            id={fieldId}
            value={roomId}
            disabled={replacing}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">建物全体</option>
            {rooms?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomNo}号室
              </option>
            ))}
          </select>
        )}
      </Field>

      {replacing ? (
        <>
          <Field label="取り替えた日">
            {(fieldId) => (
              <input
                id={fieldId}
                type="date"
                value={replacedOn}
                onChange={(e) => setReplacedOn(e.target.value)}
              />
            )}
          </Field>

          <Field label="かかった金額" hint="入れると、③修繕・費用にも記録が残ります">
            {(fieldId) => (
              <input
                id={fieldId}
                className="num"
                type="text"
                inputMode="numeric"
                value={amount}
                placeholder="180000"
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
        </>
      ) : (
        <Field
          label="設置した年月"
          hint="「2014-04」のように、年と月を入れます。日にちまでは要りません"
          required
        >
          {(fieldId) => (
            <input
              id={fieldId}
              className="num"
              type="month"
              value={installedOn}
              onChange={(e) => setInstalledOn(e.target.value)}
            />
          )}
        </Field>
      )}

      <Field
        label="何年もつ見込みか"
        hint="あくまで目安です。使い方や機種で変わるので、あとから直せます"
      >
        {(fieldId) => (
          <div className={s.years}>
            <input
              id={fieldId}
              className="num"
              type="number"
              min={1}
              max={50}
              value={lifeYears}
              onChange={(e) => setLifeYears(Number(e.target.value) || 1)}
            />
            <span>年</span>
          </div>
        )}
      </Field>

      <Field label="メーカー">
        {(fieldId) => (
          <input
            id={fieldId}
            type="text"
            value={maker}
            placeholder="△△工業"
            onChange={(e) => setMaker(e.target.value)}
          />
        )}
      </Field>

      <Field label="型番">
        {(fieldId) => (
          <input
            id={fieldId}
            type="text"
            value={model}
            placeholder="GT-2060"
            onChange={(e) => setModel(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="覚え書き"
        hint="どこの業者に頼んだか、なぜその機種にしたかを残しておくと、次のときに助かります"
      >
        {(fieldId) => (
          <textarea id={fieldId} value={memo} onChange={(e) => setMemo(e.target.value)} />
        )}
      </Field>

      {error && <p className={s.error}>{error}</p>}

      <button
        className={s.primary}
        onClick={() => void (replacing ? replace() : save())}
        disabled={busy}
      >
        {busy ? '保存しています…' : replacing ? '取り替えたことを記録する' : '保存する'}
      </button>

      {editing && (
        <ConfirmDelete
          label="この設備を消す"
          warning={`消すと、⑥の一覧に出なくなります。
            設置した年月は、あとから思い出せないことが多い記録です。
            取り替えたのであれば、消さずに「取り替えたことを記録する」を選んでください。
            そうすれば「前のは何年もったか」が次の判断に残ります。`}
          busy={busy}
          onConfirm={() => void remove()}
        />
      )}
    </Screen>
  )
}

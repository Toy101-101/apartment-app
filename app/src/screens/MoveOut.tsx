import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { VoiceMemo } from '../components/VoiceMemo'
import { db } from '../db'
import { formatDate, yen } from '../lib/date'
import {
  addDeduction, buildSteps, readMoveOut, removeDeduction, setMoveOutMemo, settle, toggleStep,
} from '../lib/moveout'
import s from './MoveOut.module.css'

/**
 * 退去の立会いと敷金の精算
 *
 * 退去は年に1〜2回しか起きないので、手順を覚えていられない。
 * だから**やることを並べて、押すだけで済にする**。
 *
 * そしてこの画面の主役は、金額ではなく**「なぜ引いたか」**。
 * 敷金で揉めるのは金額そのものではなく、理由が分からないとき。
 * だから差し引きは、理由を書かないと足せないようにしてある。
 */

function toInt(value: string): number {
  const n = Number(value.replace(/[^0-9]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export default function MoveOut() {
  const { id } = useParams()
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    if (!id) return null
    const lease = await db.leases.get(id)
    if (!lease) return null
    const [room, tenant, moveOut] = await Promise.all([
      db.rooms.get(lease.roomId),
      db.tenants.get(lease.tenantId),
      readMoveOut(lease.id),
    ])
    return { lease, room, tenant, moveOut }
  }, [id])

  if (data === undefined) {
    return (
      <Screen title="退去の手続き" back="/contracts">
        <p className={s.note}>読み込んでいます…</p>
      </Screen>
    )
  }
  if (data === null) {
    return (
      <Screen title="退去の手続き" back="/contracts" backLabel="一覧にもどる">
        <p className={s.note}>その契約が見つかりませんでした。</p>
      </Screen>
    )
  }

  const { lease, room, tenant, moveOut } = data
  const steps = buildSteps(moveOut)
  const money = settle(lease.deposit, moveOut?.deductions ?? [])
  const remaining = steps.filter((x) => !x.done).length
  const back = `/contracts/${lease.id}`

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="退去の手続き" back={back} backLabel="契約にもどる">
      <section className={s.head}>
        <div className={s.who}>
          {room?.roomNo}号室 {tenant?.name}
        </div>
        <div className={s.when}>
          {lease.movedOutOn
            ? `${formatDate(lease.movedOutOn)}に退去`
            : 'まだ退去にしていません'}
        </div>
        {!lease.movedOutOn && (
          <p className={s.warn}>
            先に契約の画面で「退去にする」を済ませてください。
            退去した日が入っていないと、ホームのお知らせにも出ません。
          </p>
        )}
      </section>

      <h2 className={s.groupTitle}>
        やること
        <span className={s.count}>
          {remaining === 0 ? 'すべて済みました' : `残り${remaining}件`}
        </span>
      </h2>
      <ul className={s.steps}>
        {steps.map((step) => (
          <li key={step.key}>
            <button
              className={step.done ? s.stepDone : s.step}
              aria-pressed={step.done}
              disabled={busy}
              onClick={() => void run(() => toggleStep(lease.id, step.key))}
            >
              <span className={s.mark} aria-hidden="true">{step.done ? '✓' : ''}</span>
              <span className={s.stepBody}>
                <span className={s.stepLabel}>{step.label}</span>
                {step.hint && <span className={s.stepHint}>{step.hint}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className={s.groupTitle}>敷金の精算</h2>
      <ul className={s.money}>
        <li>
          <span>預かっている敷金</span>
          <b className="num">{yen(money.deposit)}</b>
        </li>
        <li>
          <span>差し引く額</span>
          <b className="num">{money.deducted > 0 ? `− ${yen(money.deducted)}` : yen(0)}</b>
        </li>
      </ul>
      <p className={money.shortfall > 0 ? s.shortfall : s.refund}>
        {money.shortfall > 0 ? (
          <>
            敷金では <b className="num">{yen(money.shortfall)}</b> 足りません
            <span className={s.refundNote}>この額を、別に請求することになります</span>
          </>
        ) : (
          <>
            お返しする額 <b className="num">{yen(money.refund)}</b>
          </>
        )}
      </p>

      {(moveOut?.deductions.length ?? 0) > 0 && (
        <ul className={s.deductions}>
          {moveOut?.deductions.map((d) => (
            <li key={d.id}>
              <div className={s.dHead}>
                <span className={s.dTitle}>{d.title}</span>
                <b className={`${s.dAmount} num`}>{yen(d.amount)}</b>
              </div>
              {/* 金額より理由のほうを大きく置く。揉めるのは理由が分からないとき */}
              <p className={s.dReason}>{d.reason}</p>
              <button
                className={s.dDelete}
                disabled={busy}
                onClick={() => void run(() => removeDeduction(lease.id, d.id))}
              >
                この差し引きを消す
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <section className={s.panel}>
          <h3 className={s.panelTitle}>差し引きを足す</h3>
          <Field label="何の費用か" required>
            {(fieldId) => (
              <input
                id={fieldId}
                type="text"
                value={title}
                placeholder="クロスの張り替え（居室）"
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <Field label="引く額" required>
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
          <Field
            label="なぜ引くのか"
            hint="ここがいちばん大事です。話して書くこともできます"
            required
          >
            {(fieldId) => <VoiceMemo id={fieldId} value={reason} onChange={setReason} />}
          </Field>
          <button
            className={s.panelSave}
            disabled={busy || !title.trim() || !reason.trim() || toInt(amount) <= 0}
            onClick={() => void run(async () => {
              await addDeduction(lease.id, {
                title, amount: toInt(amount), reason,
              })
              setTitle('')
              setAmount('')
              setReason('')
              setAdding(false)
            })}
          >
            この差し引きを足す
          </button>
          <button className={s.panelCancel} disabled={busy} onClick={() => setAdding(false)}>
            やめる
          </button>
        </section>
      ) : (
        <button className={s.add} onClick={() => setAdding(true)}>
          ＋ 差し引きを足す
        </button>
      )}

      <p className={s.caution}>
        ここに入れるのは、<b>敷金から引く額</b>です。
        業者に実際に払った額は、③修繕・費用のほうに別に記録してください。
        両方に入れないと、年ごとのまとめで二重に数えてしまいます。
      </p>

      <h2 className={s.groupTitle}>覚え書き</h2>
      <Field label="この退去について" hint="話して書くこともできます">
        {(fieldId) => (
          <VoiceMemo
            id={fieldId}
            value={memo ?? moveOut?.memo ?? ''}
            onChange={setMemo}
          />
        )}
      </Field>
      <button
        className={s.save}
        disabled={busy || memo === null}
        onClick={() => void run(async () => {
          await setMoveOutMemo(lease.id, memo ?? '')
          setMemo(null)
        })}
      >
        覚え書きを残す
      </button>
    </Screen>
  )
}

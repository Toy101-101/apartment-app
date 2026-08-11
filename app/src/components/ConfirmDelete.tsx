import { useState } from 'react'
import s from './ConfirmDelete.module.css'

/**
 * 消す前の、ひと呼吸
 *
 * 消しても行そのものは残る（`deletedAt` を入れるだけ）が、
 * **画面から戻す手立てが無い**。利用者から見れば、押しまちがい1回で消滅する。
 * 設備の年式のように「2014年に付けた」という、もう思い出せない情報が入っているので、
 * 消えると作り直せない。
 *
 * だから「消す」を2回に分ける。1回目で**何が起きるか**を文で見せ、2回目でやっと消す。
 * 端末の確認窓（`confirm()`）を使わないのは、字が小さく、
 * ホーム画面から開いたアプリでは出ないことがあるため。
 */
export function ConfirmDelete({
  label, warning, busy, onConfirm,
}: {
  /** ふだん出るボタンの文言。例:「この設備を消す」 */
  label: string
  /** 消すと何が起きるか。ここを読ませるための2段階 */
  warning: string
  busy?: boolean
  onConfirm: () => void
}) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button className={s.remove} disabled={busy} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }

  return (
    <section className={s.confirm}>
      <p className={s.warning}>{warning}</p>
      <button className={s.yes} disabled={busy} onClick={onConfirm}>
        {busy ? '消しています…' : `本当に${label}`}
      </button>
      <button className={s.no} disabled={busy} onClick={() => setAsking(false)}>
        やめる
      </button>
    </section>
  )
}

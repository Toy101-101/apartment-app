import { useId, type ReactNode } from 'react'
import s from './Field.module.css'

/**
 * 入力欄ひとつぶん（見出し・補足・中身）
 *
 * 見出しと入力欄は必ず結びつける（label の for）。
 * そうしないと、見出しを押しても欄に入らず「反応しない」と受け取られる。
 */
export function Field({
  label, hint, required, error, children,
}: {
  label: string
  hint?: string
  required?: boolean
  error?: string
  /** id を受け取って input などを返す */
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
        {required && <span className={s.required}>（必ず入れる）</span>}
      </label>
      {hint && <p className={s.hint}>{hint}</p>}
      {children(id)}
      {error && <p className={s.error}>{error}</p>}
    </div>
  )
}

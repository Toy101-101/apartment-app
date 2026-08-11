import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import s from './Screen.module.css'

/**
 * ホーム以外の画面の外枠
 *
 * - 上のバーは常に「いまどこにいるか」を出す
 * - もどる場所は上と下の両方に置く。上端は片手持ちの親指が届かないため、
 *   いちばん下の「ホームにもどる」が本命
 */
export function Screen({
  title, back = '/', backLabel = 'ホームにもどる', children, fixed,
}: {
  title: string
  /** 上の「‹」で戻る先 */
  back?: string
  /** いちばん下のボタンの文言 */
  backLabel?: string
  children: ReactNode
  /** 画面下に貼りつけるもの（取り消しの帯など） */
  fixed?: ReactNode
}) {
  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <Link className={s.back} to={back} aria-label="ひとつ前にもどる">
          ‹
        </Link>
        <div className={s.barTitle}>{title}</div>
        <span className={s.backSpacer} aria-hidden="true" />
      </header>

      <main className={s.body}>
        {children}
        <Link className={s.home} to={back}>
          {backLabel}
        </Link>
      </main>

      {fixed}
    </div>
  )
}

import { useState } from 'react'
import { IS_DEMO } from '../lib/demo'
import { loadSample } from '../lib/sample'
import s from './DemoBanner.module.css'

/**
 * 見本モードの帯（`?demo=1` で開いたときだけ出る）
 *
 * 常に出しておく理由は1つ。**本物の記録と取りちがえさせない**ため。
 * 架空の入居者を見て「祖父の記録が書きかわった」と思われるのが、いちばん困る。
 *
 * 画面を移るたびにいちばん上から表示される（`ScrollToTop`）ので、
 * 貼りつけにしなくても、どの画面でも必ず目に入る。
 */
export function DemoBanner() {
  const [busy, setBusy] = useState(false)

  // 守りは2重にする。この帯の中のボタンは `loadSample()` ―― 本体の表を
  // 消してから入れ直す、アプリでいちばん危ない処理 ―― に直結している。
  // 呼び出す側（main.tsx）の条件を将来だれかが外しても、ここで必ず止まる
  if (!IS_DEMO) return null

  return (
    <div className={s.wrap}>
      <p className={s.text}>
        <b className={s.strong}>これは見本の画面です</b>
        入居者の名前・電話番号・金額は、すべて架空のものです。
        ここで何を押しても、<b>本物の記録には影響しません</b>（保存場所が別になっています）。
      </p>
      <button
        className={s.reset}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void loadSample().finally(() => setBusy(false))
        }}
      >
        {busy ? 'もどしています…' : '見本を最初の状態にもどす'}
      </button>
    </div>
  )
}

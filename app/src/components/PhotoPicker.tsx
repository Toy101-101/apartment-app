import { useEffect, useRef, useState } from 'react'
import { compressImage, type PickedPhoto } from '../lib/photos'
import s from './PhotoPicker.module.css'

/**
 * 写真を選ぶ・撮る
 *
 * 選んだ時点では、まだ端末に保存しない（小さくしたものを画面が持っているだけ）。
 * 「この内容で記録する」を押したときにまとめて保存するので、
 * 途中でやめた写真がゴミとして残らない。
 *
 * `capture="environment"` は付けない。付けるとiPhoneでカメラしか開けなくなり、
 * 「先に撮っておいた写真」を選べなくなるため。付けなければ
 * 「写真を撮る／ライブラリから選ぶ」の両方が出る。
 */
export function PhotoPicker({
  photos, onChange,
}: {
  photos: PickedPhoto[]
  onChange: (photos: PickedPhoto[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setFailed('')
    try {
      const added: PickedPhoto[] = []
      for (const file of Array.from(files)) {
        added.push(await compressImage(file))
      }
      onChange([...photos, ...added])
    } catch {
      setFailed('この写真は読み込めませんでした。ほかの写真でお試しください。')
    } finally {
      setBusy(false)
      // 同じ写真をもう一度選べるように、選んだ記録を消しておく
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      {photos.length > 0 && (
        <ul className={s.grid}>
          {photos.map((photo, i) => (
            <li key={photo.id ?? `new-${i}`}>
              <Thumb photo={photo} />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
              >
                この写真を外す
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        className={s.file}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        className={s.add}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? '写真を取りこんでいます…' : '📷 写真を撮る・選ぶ'}
      </button>
      <p className={s.hint}>
        撮った写真は、そのままだと大きすぎるので自動で小さくします（1枚あたり200〜400KB）。
        iPhoneの縦向きの写真も、横倒しになりません。
      </p>
      {failed && <p className={s.failed}>{failed}</p>}
    </div>
  )
}

/** 1枚ぶんの見本表示。画面から消えるときに必ず後片づけする */
function Thumb({ photo }: { photo: PickedPhoto }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob)
    setUrl(objectUrl)
    // 解放しないとメモリを食い続ける
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo.blob])

  return <img src={url} alt="" width={photo.width} height={photo.height} />
}

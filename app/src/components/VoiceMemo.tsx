import { useEffect, useRef, useState } from 'react'
import { appendTranscript, isSpeechSupported, startSpeech, type SpeechSession } from '../lib/speech'
import s from './VoiceMemo.module.css'

/**
 * 話して書けるメモ欄
 *
 * 話した言葉は必ず**下の欄に文字として入る**。そのまま保存されることはないので、
 * 聞きまちがいがあっても手で直せる。
 *
 * 音声に対応していない端末では、ボタンを出さずにただのメモ欄になる。
 * その場合でも、キーボードのマイクを使えば話して入れられる（OS標準のほう）。
 */
export function VoiceMemo({
  id, value, onChange, placeholder, rows,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const session = useRef<SpeechSession | null>(null)

  // 認識にはネット接続が要る。切れたら押せないようにする
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // 画面を離れるときは必ず止める（止め忘れるとマイクが開いたままになる）
  useEffect(() => () => session.current?.stop(), [])

  // onFinal から最新の値を読むため、参照で持っておく
  const latest = useRef(value)
  latest.current = value

  function start() {
    setMessage('')
    setInterim('')
    const started = startSpeech({
      onFinal: (text) => {
        latest.current = appendTranscript(latest.current, text)
        onChange(latest.current)
      },
      onInterim: setInterim,
      onStop: (reason) => {
        setListening(false)
        setInterim('')
        session.current = null
        if (reason) setMessage(reason)
      },
    })
    if (!started) return
    session.current = started
    setListening(true)
  }

  function stop() {
    session.current?.stop()
    setListening(false)
    setInterim('')
  }

  const supported = isSpeechSupported()

  return (
    <div>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />

      {listening && (
        <p className={s.interim} aria-live="polite">
          {interim ? interim : 'お話しください…'}
        </p>
      )}

      {supported && (
        <>
          <button
            type="button"
            className={`${s.mic} ${listening ? s.listening : ''}`}
            onClick={listening ? stop : start}
            disabled={!online}
          >
            {listening ? '■ 話し終わった' : '🎤 押して話す'}
          </button>
          <p className={s.hint}>
            {!online
              ? '電波が無いので、いまは音声入力を使えません。文字で書いてください。'
              : listening
                ? '話した言葉は、上の欄に文字で入ります。あとから手で直せます。'
                : '押すと「マイクを使ってよいか」を尋ねられます。話した言葉が上の欄に文字で入ります。'}
          </p>
        </>
      )}

      {message && <p className={s.message}>{message}</p>}
    </div>
  )
}

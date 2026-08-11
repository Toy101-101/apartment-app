/**
 * 音声入力
 *
 * 「打ちにくい人のための代わりの手段」ではなく、**文字より速く・多く残せるから**入れる。
 * 経緯メモがこのアプリの主役なので、話して残せることは目的に直接効く。
 *
 * 必ず守ること（PLAN.md より）
 * - 認識した言葉は**必ず編集できる文字として欄に入れる**。自動で保存・確定しない
 * - 認識にはネット接続が要る。電波が無いときはボタンを無効にし「文字で書く」に誘導する
 * - iOS Safari は1回の認識が1分ほどで勝手に終わる → `onend` で黙って再開する
 * - 対応していないブラウザでは**ボタン自体を出さない**（押せないボタンは故障に見える）
 */

/** ブラウザの音声認識。型が用意されていないので、使うぶんだけ自分で書く */
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as RecognitionCtor | undefined
}

/** この端末で音声入力が使えるか（使えないならボタンを出さない） */
export function isSpeechSupported(): boolean {
  return ctor() !== undefined
}

/**
 * 話した文を、いま欄に入っている文につなぐ。
 * 前の文が句点で終わっていれば改行して次の文にする（読みやすさのため）。
 */
export function appendTranscript(base: string, addition: string): string {
  const add = addition.trim()
  if (!add) return base
  if (!base.trim()) return add
  const left = base.trimEnd()
  return /[。！？]$/.test(left) ? `${left}\n${add}` : left + add
}

export interface SpeechSession {
  /** 本人が「話し終わった」を押したとき */
  stop(): void
}

export interface SpeechHandlers {
  /** 言葉が確定したとき（本文に入れてよい） */
  onFinal(text: string): void
  /** 話している途中（薄く出すだけ。保存しない） */
  onInterim(text: string): void
  /** 終わったとき。理由があれば画面に出す */
  onStop(reason?: string): void
}

/** 音声認識をはじめる。対応していない端末では null を返す */
export function startSpeech(handlers: SpeechHandlers): SpeechSession | null {
  const Ctor = ctor()
  if (!Ctor) return null

  const recognition = new Ctor()
  let stopped = false

  recognition.lang = 'ja-JP'
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) handlers.onFinal(result[0].transcript)
      else interim += result[0].transcript
    }
    handlers.onInterim(interim)
  }

  recognition.onerror = (event) => {
    // 黙っているだけ（no-speech）や、こちらから止めた（aborted）ときは何も言わない
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      stopped = true
      handlers.onStop('マイクの使用が許可されていません。端末の設定をご確認ください。')
    } else if (event.error === 'network') {
      stopped = true
      handlers.onStop('電波が届かないため、音声入力を終わりました。文字で書いてください。')
    }
  }

  recognition.onend = () => {
    if (stopped) {
      handlers.onStop()
      return
    }
    // iOS Safari は1分ほどで勝手に終わる。本人が止めていなければ黙って続ける
    try {
      recognition.start()
    } catch {
      handlers.onStop()
    }
  }

  recognition.start()

  return {
    stop() {
      stopped = true
      recognition.stop()
    },
  }
}

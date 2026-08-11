import { describe, it, expect } from 'vitest'
import { appendTranscript, isSpeechSupported } from './speech'

/**
 * 音声入力の試験
 *
 * 認識そのものはブラウザの機能なので、ここでは動かせない。
 * 確かめられるのは「話した文を、いま欄にある文にどうつなぐか」の決まりごと。
 */

describe('話した文をつなぐ', () => {
  it('欄が空なら、そのまま入る', () => {
    expect(appendTranscript('', 'お湯の出が悪いと言われていた')).toBe('お湯の出が悪いと言われていた')
  })

  it('言いかけの続きは、そのままつながる', () => {
    expect(appendTranscript('お湯の出が', '悪いと言われていた'))
      .toBe('お湯の出が悪いと言われていた')
  })

  it('句点で終わっていたら、次の文は改行して始める', () => {
    expect(appendTranscript('修理では直らないと言われた。', '新品に交換した'))
      .toBe('修理では直らないと言われた。\n新品に交換した')
    expect(appendTranscript('直りますか？', 'いいえ')).toBe('直りますか？\nいいえ')
  })

  it('聞きとれなかったときは、何も足さない', () => {
    expect(appendTranscript('もとの文', '')).toBe('もとの文')
    expect(appendTranscript('もとの文', '   ')).toBe('もとの文')
  })

  it('前後の余分な空白は落とす', () => {
    expect(appendTranscript('もとの文  ', '  つづき  ')).toBe('もとの文つづき')
  })

  it('手で打った文のあとに話しても、消さずに足す', () => {
    expect(appendTranscript('手で打った。', '話して足した'))
      .toBe('手で打った。\n話して足した')
  })
})

describe('使える端末かどうか', () => {
  it('音声認識の無いところでは、使えないと答える（ボタンを出さないため）', () => {
    // 試験は node で動かしているので window そのものが無い
    expect(isSpeechSupported()).toBe(false)
  })
})

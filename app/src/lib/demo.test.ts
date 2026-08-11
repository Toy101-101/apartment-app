import { describe, expect, it } from 'vitest'
import { DEMO_DB, demoFrom, REAL_DB } from './demo'

/**
 * 見本モードの試験
 *
 * ここが狂うと、見本データが本物の記録を消す。
 * 「?demo=1 のときだけ」であることを、細かく押さえておく。
 */
describe('demoFrom', () => {
  it('?demo=1 のときだけ見本モードになる', () => {
    expect(demoFrom('?demo=1')).toBe(true)
  })

  it('ほかの問い合わせが混ざっていても読み取れる', () => {
    expect(demoFrom('?a=1&demo=1&b=2')).toBe(true)
  })

  it('付いていなければ本物', () => {
    expect(demoFrom('')).toBe(false)
    expect(demoFrom('?')).toBe(false)
    expect(demoFrom('?other=1')).toBe(false)
  })

  it('値が 1 でなければ本物あつかい（打ちまちがいで見本にしない）', () => {
    expect(demoFrom('?demo=0')).toBe(false)
    expect(demoFrom('?demo')).toBe(false)
    expect(demoFrom('?demo=true')).toBe(false)
    expect(demoFrom('?demonstration=1')).toBe(false)
  })
})

describe('置き場の名前', () => {
  it('本物と見本で必ず違う（同じなら混ざってしまう）', () => {
    expect(REAL_DB).not.toBe(DEMO_DB)
  })
})

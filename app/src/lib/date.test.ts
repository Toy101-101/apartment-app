import { describe, it, expect } from 'vitest'
import {
  parseDate, toISO, addDays, daysUntil, formatDate, formatShort,
  monthKey, formatMonth, shiftMonth, yen,
} from './date'

describe('日付の解釈', () => {
  it('UTCとして解釈されず、日本時間で正しい日になる', () => {
    // new Date('2026-08-25') だと環境によって24日になってしまう。それを防げているか
    const d = parseDate('2026-08-25')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // 0始まりなので8月
    expect(d.getDate()).toBe(25)
  })

  it('往復しても変わらない', () => {
    expect(toISO(parseDate('2019-05-01'))).toBe('2019-05-01')
  })
})

describe('日をずらす', () => {
  it('翌日・前日が出る（契約の更新は前の契約の翌日から始める）', () => {
    expect(addDays('2026-08-25', 1)).toBe('2026-08-26')
    expect(addDays('2026-08-25', -1)).toBe('2026-08-24')
  })

  it('月末・年末をまたいでも合う', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('うるう年をまたいでも合う', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('残り日数', () => {
  it('未来は正、過去は負', () => {
    expect(daysUntil('2026-08-25', '2026-08-10')).toBe(15)
    expect(daysUntil('2026-08-01', '2026-08-10')).toBe(-9)
    expect(daysUntil('2026-08-10', '2026-08-10')).toBe(0)
  })

  it('月をまたいでも合う', () => {
    expect(daysUntil('2026-09-30', '2026-08-10')).toBe(51)
  })

  it('うるう年をまたいでも合う', () => {
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2) // 2028年は閏年
  })
})

describe('和暦の表示', () => {
  it('令和8年8月10日（月）の形で出る', () => {
    expect(formatDate('2026-08-10')).toBe('令和8年8月10日（月）')
  })

  it('令和のはじまり（2019年5月1日）から令和1年になる', () => {
    expect(formatDate('2019-05-01')).toBe('令和1年5月1日（水）')
  })

  it('令和より前は西暦のまま出す（平成と誤って書かない）', () => {
    expect(formatDate('2019-04-30')).toBe('2019年4月30日（火）')
    expect(formatDate('2018-04-01')).toBe('2018年4月1日（日）')
  })

  it('曜日が正しい', () => {
    expect(formatDate('2026-08-09')).toContain('（日）')
    expect(formatDate('2026-08-15')).toContain('（土）')
  })

  it('短い表示は月日だけ', () => {
    expect(formatShort('2026-08-10')).toBe('8月10日')
  })
})

describe('月の扱い', () => {
  it('令和8年8月分の形で出る', () => {
    expect(formatMonth('2026-08')).toBe('令和8年8月分')
  })

  it('前後の月に動かせる', () => {
    expect(shiftMonth('2026-08', -1)).toBe('2026-07')
    expect(shiftMonth('2026-08', 1)).toBe('2026-09')
  })

  it('年をまたいでも動く', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('12か月戻すと1年前になる', () => {
    expect(shiftMonth('2026-08', -12)).toBe('2025-08')
  })

  it('Dateから月のキーを作れる', () => {
    expect(monthKey(new Date(2026, 7, 10))).toBe('2026-08')
  })
})

describe('金額', () => {
  it('3桁ごとに区切る', () => {
    expect(yen(55000)).toBe('¥55,000')
    expect(yen(128000)).toBe('¥128,000')
    expect(yen(0)).toBe('¥0')
  })

  it('小数は円に丸める', () => {
    expect(yen(1234.6)).toBe('¥1,235')
  })
})

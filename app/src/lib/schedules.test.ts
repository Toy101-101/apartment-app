// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Schedule } from '../db'
import { addMonths } from './date'
import {
  buildScheduleRows,
  completeSchedule,
  createSchedule,
  everyText,
  levelOf,
  needsAttention,
  nextDateAfter,
  noticeText,
  removeSchedule,
  updateSchedule,
} from './schedules'

/**
 * 年間の予定の試験
 *
 * 火災保険の更新を落とすと1年ぶん無保険になる。固定資産税を落とすと延滞金がつく。
 * 「知らせそこねない」ことと「日付がずれていかない」ことを重点的に確かめる。
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const schedule = (id: string, nextDate: string, extra: Partial<Schedule> = {}): Schedule => ({
  id, ...base, title: id, kind: 'other', nextDate,
  everyMonths: 12, noticeDays: 60, ...extra,
})

describe('nextDateAfter', () => {
  it('予定日を起点に進める（済ませた日を起点にしない）', () => {
    // 8月1日が予定で、うっかり8月20日に済ませても、来年はやはり8月1日
    expect(nextDateAfter('2026-08-01', 12, '2026-08-20')).toBe('2027-08-01')
  })

  it('年4回なら3か月ずつ進む', () => {
    expect(nextDateAfter('2026-05-31', 3, '2026-05-31')).toBe('2026-08-31')
  })

  it('月末が短い月に当たっても、その月の月末に丸める', () => {
    // 8月31日の6か月後は「2月31日」。素直に計算すると3月3日になってしまう
    expect(nextDateAfter('2026-08-31', 6, '2026-08-31')).toBe('2027-02-28')
  })

  it('何年も放っておいても、次回が過去のままにならない', () => {
    const next = nextDateAfter('2020-04-01', 12, '2026-08-11')
    expect(next).toBe('2027-04-01')
  })

  it('1回きりの予定には次回が無い', () => {
    expect(nextDateAfter('2026-08-01', 0, '2026-08-01')).toBeUndefined()
  })
})

describe('levelOf', () => {
  it('過ぎているものは赤', () => {
    expect(levelOf(-3, 60)).toBe('red')
  })

  it('今日と1週間以内は赤', () => {
    expect(levelOf(0, 60)).toBe('red')
    expect(levelOf(7, 60)).toBe('red')
  })

  it('知らせる範囲に入ったら黄', () => {
    expect(levelOf(8, 60)).toBe('yellow')
    expect(levelOf(60, 60)).toBe('yellow')
  })

  it('知らせる範囲より先なら出さない', () => {
    expect(levelOf(61, 60)).toBe('none')
  })

  it('知らせる範囲は予定ごとに違う', () => {
    expect(levelOf(45, 30)).toBe('none')
    expect(levelOf(45, 60)).toBe('yellow')
  })
})

describe('noticeText', () => {
  it('過ぎているときは、何日過ぎたかを言う', () => {
    expect(noticeText(-3)).toBe('3日過ぎています')
  })

  it('当日は「今日です」', () => {
    expect(noticeText(0)).toBe('今日です')
  })

  it('まだのときは、あと何日かを言う', () => {
    expect(noticeText(12)).toBe('あと12日')
  })
})

describe('everyText', () => {
  it('よくある間隔は言葉で言う', () => {
    expect(everyText(12)).toBe('年1回')
    expect(everyText(6)).toBe('年2回')
    expect(everyText(3)).toBe('年4回')
    expect(everyText(1)).toBe('毎月')
    expect(everyText(0)).toBe('1回きり')
  })

  it('あてはまらない間隔は、そのまま月数で言う', () => {
    expect(everyText(18)).toBe('18か月ごと')
  })
})

describe('buildScheduleRows', () => {
  it('近い順に並べ、過ぎているものを先頭に出す', () => {
    const rows = buildScheduleRows(
      [
        schedule('a', '2026-10-01'),
        schedule('b', '2026-08-01'), // 過ぎている
        schedule('c', '2026-08-20'),
      ],
      '2026-08-11',
    )
    expect(rows.map((r) => r.schedule.id)).toEqual(['b', 'c', 'a'])
    expect(rows[0].days).toBe(-10)
    expect(rows[0].text).toBe('10日過ぎています')
  })

  it('消した予定は出さない', () => {
    const rows = buildScheduleRows(
      [schedule('a', '2026-09-01'), { ...schedule('b', '2026-09-02'), deletedAt: T }],
      '2026-08-11',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].schedule.id).toBe('a')
  })
})

describe('needsAttention', () => {
  it('知らせる範囲に入ったものだけを返す', () => {
    const rows = buildScheduleRows(
      [
        schedule('soon', '2026-08-20', { noticeDays: 60 }),
        schedule('far', '2027-08-01', { noticeDays: 60 }),
        schedule('late', '2026-07-01', { noticeDays: 60 }),
      ],
      '2026-08-11',
    )
    expect(needsAttention(rows).map((r) => r.schedule.id)).toEqual(['late', 'soon'])
  })

  it('何も近くなければ空になる', () => {
    const rows = buildScheduleRows([schedule('far', '2027-08-01')], '2026-08-11')
    expect(needsAttention(rows)).toEqual([])
  })
})

describe('予定の登録と書きかえ', () => {
  beforeEach(async () => {
    await db.open()
    await db.schedules.clear()
    await db.expenses.clear()
  })

  it('登録できる。空の欄は鍵ごと落とす', async () => {
    const id = await createSchedule({
      title: '  火災保険の更新  ', kind: 'insurance',
      nextDate: '2027-04-01', everyMonths: 12, noticeDays: 60,
      vendor: '  ', memo: '',
    })
    const saved = await db.schedules.get(id)
    expect(saved?.title).toBe('火災保険の更新')
    expect('vendor' in (saved ?? {})).toBe(false)
    expect('memo' in (saved ?? {})).toBe(false)
  })

  it('書きかえられる', async () => {
    const id = await createSchedule({
      title: '消防設備点検', kind: 'inspection',
      nextDate: '2026-10-01', everyMonths: 6, noticeDays: 60,
    })
    await updateSchedule(id, {
      title: '消防設備点検', kind: 'inspection',
      nextDate: '2026-11-01', everyMonths: 6, noticeDays: 30,
    })
    const saved = await db.schedules.get(id)
    expect(saved?.nextDate).toBe('2026-11-01')
    expect(saved?.noticeDays).toBe(30)
  })

  it('消しても行は残る（消した印をつけるだけ）', async () => {
    const id = await createSchedule({
      title: '草刈り', kind: 'other',
      nextDate: '2026-09-01', everyMonths: 6, noticeDays: 30,
    })
    await removeSchedule(id)
    expect((await db.schedules.get(id))?.deletedAt).toBeTruthy()
    expect(await db.schedules.count()).toBe(1)
  })
})

describe('済ませたことにする', () => {
  beforeEach(async () => {
    await db.open()
    await db.schedules.clear()
    await db.expenses.clear()
  })

  it('次回へ進み、金額を入れれば③修繕・費用に固定費が残る', async () => {
    const id = await createSchedule({
      title: '火災保険の更新', kind: 'insurance',
      nextDate: '2026-08-01', everyMonths: 12, noticeDays: 60,
      vendor: '□□損保', memo: '3年契約を1年に変えた',
    })

    const result = await completeSchedule(id, { date: '2026-08-11', amount: 48000 })

    expect(result.nextDate).toBe('2027-08-01')
    expect((await db.schedules.get(id))?.nextDate).toBe('2027-08-01')

    const expenses = await db.expenses.toArray()
    expect(expenses).toHaveLength(1)
    expect(expenses[0].kind).toBe('fixed')
    expect(expenses[0].title).toBe('火災保険の更新')
    expect(expenses[0].amount).toBe(48000)
    expect(expenses[0].date).toBe('2026-08-11')
    expect(expenses[0].vendor).toBe('□□損保')
    expect(expenses[0].memo).toBe('3年契約を1年に変えた')
  })

  it('金額を入れなければ、③に記録は作らない', async () => {
    // 点検が管理会社もちで、こちらの出費が無いことがある
    const id = await createSchedule({
      title: '消防設備点検', kind: 'inspection',
      nextDate: '2026-08-01', everyMonths: 6, noticeDays: 60,
    })
    const result = await completeSchedule(id, { date: '2026-08-11' })

    expect(result.expenseId).toBeUndefined()
    expect(await db.expenses.count()).toBe(0)
    expect(result.nextDate).toBe('2027-02-01')
  })

  it('金額に0を入れても、③に記録は作らない', async () => {
    const id = await createSchedule({
      title: '点検', kind: 'inspection',
      nextDate: '2026-08-01', everyMonths: 6, noticeDays: 60,
    })
    await completeSchedule(id, { date: '2026-08-11', amount: 0 })
    expect(await db.expenses.count()).toBe(0)
  })

  it('1回きりの予定は、済ませたら一覧から消える', async () => {
    const id = await createSchedule({
      title: '給湯器の交換', kind: 'other',
      nextDate: '2026-08-01', everyMonths: 0, noticeDays: 30,
    })
    const result = await completeSchedule(id, { date: '2026-08-11', amount: 180000 })

    expect(result.nextDate).toBeUndefined()
    expect((await db.schedules.get(id))?.deletedAt).toBeTruthy()
    // 記録のほうは③に残る
    expect(await db.expenses.count()).toBe(1)
  })

  it('無い予定を済ませようとしたら、日本語で断る', async () => {
    await expect(completeSchedule('ない-id', { date: '2026-08-11' }))
      .rejects.toThrow(/見つかりませんでした/)
  })
})

describe('addMonths（予定の土台）', () => {
  it('月末を、その月の月末に丸める', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29') // うるう年
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('月末でなければ、日はそのまま', () => {
    expect(addMonths('2026-08-11', 3)).toBe('2026-11-11')
  })

  it('年をまたぐ', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('前へも戻せる', () => {
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
  })
})

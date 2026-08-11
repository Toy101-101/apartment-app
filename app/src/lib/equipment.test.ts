// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Equipment, type Room } from '../db'
import {
  ageInMonths,
  ageText,
  buildEquipmentRows,
  createEquipment,
  DEFAULT_LIFE_YEARS,
  levelOf,
  lifeText,
  needsAttention,
  overdue,
  removeEquipment,
  replaceEquipment,
  replacedHistory,
  updateEquipment,
} from './equipment'

/**
 * 設備の年式の試験
 *
 * 「そろそろ替え時」を先に出せること、
 * 取り替えたときに前の記録を消さないことを重点的に確かめる。
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const room = (no: string, sortOrder: number): Room => ({
  id: `r-${no}`, ...base, roomNo: no, floor: 1, sortOrder,
})

const equipment = (
  id: string, installedOn: string, extra: Partial<Equipment> = {},
): Equipment => ({
  id, ...base, kind: 'waterHeater', installedOn, lifeYears: 12, ...extra,
})

describe('ageInMonths', () => {
  it('設置からの月数を出す', () => {
    expect(ageInMonths('2014-04', '2026-08-11')).toBe(148) // 12年4か月
  })

  it('同じ月なら0', () => {
    expect(ageInMonths('2026-08', '2026-08-11')).toBe(0)
  })

  it('これからのものは負の数になる', () => {
    expect(ageInMonths('2026-12', '2026-08-11')).toBe(-4)
  })
})

describe('ageText', () => {
  it('1年に満たなければ月だけで言う', () => {
    expect(ageText(8)).toBe('8か月')
  })

  it('取り替えた直後は「今月」と言う（0か月は読みにくい）', () => {
    expect(ageText(0)).toBe('今月')
  })

  it('ちょうどの年は月を言わない', () => {
    expect(ageText(24)).toBe('2年')
  })

  it('年と月で言う', () => {
    expect(ageText(148)).toBe('12年4か月')
  })
})

describe('levelOf', () => {
  it('目安を過ぎていれば赤', () => {
    expect(levelOf(12 * 12, 12)).toBe('red')
    expect(levelOf(200, 12)).toBe('red')
  })

  it('残り2年ほどになったら黄', () => {
    expect(levelOf(10 * 12, 12)).toBe('yellow')
    expect(levelOf(12 * 12 - 1, 12)).toBe('yellow')
  })

  it('まだ先なら出さない', () => {
    expect(levelOf(10 * 12 - 1, 12)).toBe('none')
    expect(levelOf(0, 12)).toBe('none')
  })

  it('もつ年数を変えれば、判定も変わる', () => {
    expect(levelOf(11 * 12, 12)).toBe('yellow')
    expect(levelOf(11 * 12, 20)).toBe('none')
  })
})

describe('lifeText', () => {
  it('過ぎていれば、そう言う', () => {
    expect(lifeText(13 * 12, 12)).toBe('目安の12年を過ぎています')
  })

  it('1年を切ったら月で言う', () => {
    expect(lifeText(12 * 12 - 5, 12)).toBe('あと5か月ほどで替え時')
  })

  it('まだあるなら年で言う', () => {
    expect(lifeText(10 * 12, 12)).toBe('あと2年ほどで替え時')
  })
})

describe('buildEquipmentRows', () => {
  const rooms = [room('101', 1), room('102', 2)]

  it('古いものから順に並べる（替え時が近い順）', () => {
    const rows = buildEquipmentRows({
      equipment: [
        equipment('new', '2024-04', { roomId: 'r-101' }),
        equipment('old', '2012-04', { roomId: 'r-102' }),
        equipment('mid', '2018-04'),
      ],
      rooms,
      on: '2026-08-11',
    })
    expect(rows.map((r) => r.equipment.id)).toEqual(['old', 'mid', 'new'])
  })

  it('部屋の名前をあてる。部屋が無ければ建物全体', () => {
    const rows = buildEquipmentRows({
      equipment: [equipment('a', '2020-04', { roomId: 'r-101' }), equipment('b', '2020-04')],
      rooms,
      on: '2026-08-11',
    })
    expect(rows[0].target === '101号室' || rows[1].target === '101号室').toBe(true)
    expect(rows.some((r) => r.target === '建物全体')).toBe(true)
  })

  it('取り替えたものは一覧に出さない', () => {
    const rows = buildEquipmentRows({
      equipment: [
        equipment('old', '2012-04', { replacedOn: '2026-03-01' }),
        equipment('now', '2026-03'),
      ],
      rooms,
      on: '2026-08-11',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].equipment.id).toBe('now')
  })

  it('消したものは出さない', () => {
    const rows = buildEquipmentRows({
      equipment: [equipment('a', '2020-04', { deletedAt: T })],
      rooms,
      on: '2026-08-11',
    })
    expect(rows).toEqual([])
  })

  it('年数と替え時の文がついてくる', () => {
    const rows = buildEquipmentRows({
      equipment: [equipment('a', '2014-04', { roomId: 'r-101' })],
      rooms,
      on: '2026-08-11',
    })
    expect(rows[0].ageText).toBe('12年4か月')
    expect(rows[0].level).toBe('red')
    expect(rows[0].lifeText).toBe('目安の12年を過ぎています')
  })
})

describe('needsAttention と overdue', () => {
  const rows = () => buildEquipmentRows({
    equipment: [
      equipment('over', '2010-04'), // 16年
      equipment('soon', '2015-04'), // 11年
      equipment('fine', '2024-04'), // 2年
    ],
    rooms: [],
    on: '2026-08-11',
  })

  it('替え時が来ている・近いものを返す', () => {
    expect(needsAttention(rows()).map((r) => r.equipment.id)).toEqual(['over', 'soon'])
  })

  it('過ぎているものだけを返す', () => {
    expect(overdue(rows()).map((r) => r.equipment.id)).toEqual(['over'])
  })
})

describe('replacedHistory', () => {
  it('取り替えたものを新しい順に返す', () => {
    const history = replacedHistory([
      equipment('a', '2000-04', { replacedOn: '2020-05-01' }),
      equipment('b', '2020-05', { replacedOn: '2026-03-01' }),
      equipment('now', '2026-03'),
    ])
    expect(history.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('設備の登録と書きかえ', () => {
  beforeEach(async () => {
    await db.open()
    await db.equipment.clear()
    await db.expenses.clear()
  })

  it('登録できる。空の欄は鍵ごと落とす', async () => {
    const id = await createEquipment({
      kind: 'waterHeater', installedOn: '2014-04',
      lifeYears: DEFAULT_LIFE_YEARS.waterHeater,
      maker: '  ', model: '', memo: '   ',
    })
    const saved = await db.equipment.get(id)
    expect(saved?.lifeYears).toBe(12)
    expect('maker' in (saved ?? {})).toBe(false)
    expect('roomId' in (saved ?? {})).toBe(false)
  })

  it('もつ年数を、あとから直せる', async () => {
    const id = await createEquipment({
      kind: 'aircon', installedOn: '2015-06', lifeYears: 13,
    })
    await updateEquipment(id, { kind: 'aircon', installedOn: '2015-06', lifeYears: 18 })
    expect((await db.equipment.get(id))?.lifeYears).toBe(18)
  })

  it('消しても行は残る', async () => {
    const id = await createEquipment({
      kind: 'other', installedOn: '2020-01', lifeYears: 10,
    })
    await removeEquipment(id)
    expect((await db.equipment.get(id))?.deletedAt).toBeTruthy()
    expect(await db.equipment.count()).toBe(1)
  })
})

describe('取り替える', () => {
  beforeEach(async () => {
    await db.open()
    await db.equipment.clear()
    await db.expenses.clear()
  })

  it('古い記録を残したまま、新しい行を作る', async () => {
    const id = await createEquipment({
      kind: 'waterHeater', roomId: 'r-101', installedOn: '2014-04', lifeYears: 12,
      maker: '前のメーカー',
    })

    const result = await replaceEquipment(id, {
      date: '2026-08-11', amount: 180000, maker: '△△工業', model: 'GT-2060',
    })

    // 古いほうは消えず、取り替えた日が入る
    const old = await db.equipment.get(id)
    expect(old?.replacedOn).toBe('2026-08-11')
    expect(old?.installedOn).toBe('2014-04')
    expect(old?.maker).toBe('前のメーカー')

    // 新しいほうは、取り替えた月が設置年月になる
    const created = await db.equipment.get(result.newId)
    expect(created?.installedOn).toBe('2026-08')
    expect(created?.kind).toBe('waterHeater')
    expect(created?.roomId).toBe('r-101')
    expect(created?.lifeYears).toBe(12)
    expect(created?.maker).toBe('△△工業')
    expect(created?.model).toBe('GT-2060')
    expect(created?.replacedOn).toBeUndefined()

    expect(result.lastedText).toBe('12年4か月')
  })

  it('金額を入れれば、③修繕・費用に修繕として残る', async () => {
    const id = await createEquipment({
      kind: 'waterHeater', roomId: 'r-101', installedOn: '2014-04', lifeYears: 12,
    })
    await replaceEquipment(id, { date: '2026-08-11', amount: 180000 })

    const expenses = await db.expenses.toArray()
    expect(expenses).toHaveLength(1)
    expect(expenses[0].kind).toBe('repair')
    expect(expenses[0].title).toBe('給湯器の取り替え')
    expect(expenses[0].amount).toBe(180000)
    expect(expenses[0].roomId).toBe('r-101')
    // 何年もったかを、記録のほうにも残す
    expect(expenses[0].memo).toContain('12年4か月')
  })

  it('金額を入れなければ、③に記録は作らない', async () => {
    const id = await createEquipment({
      kind: 'aircon', installedOn: '2015-06', lifeYears: 13,
    })
    const result = await replaceEquipment(id, { date: '2026-08-11' })
    expect(result.expenseId).toBeUndefined()
    expect(await db.expenses.count()).toBe(0)
    // 取り替え自体は成立している
    expect(await db.equipment.count()).toBe(2)
  })

  it('取り替えたあと、一覧には新しいほうだけが出る', async () => {
    const id = await createEquipment({
      kind: 'waterHeater', installedOn: '2014-04', lifeYears: 12,
    })
    await replaceEquipment(id, { date: '2026-08-11', amount: 180000 })

    const rows = buildEquipmentRows({
      equipment: await db.equipment.toArray(), rooms: [], on: '2026-08-11',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].equipment.installedOn).toBe('2026-08')
    expect(rows[0].level).toBe('none')
  })

  it('無い設備を取り替えようとしたら、日本語で断る', async () => {
    await expect(replaceEquipment('ない-id', { date: '2026-08-11' }))
      .rejects.toThrow(/見つかりませんでした/)
  })
})

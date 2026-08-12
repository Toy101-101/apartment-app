// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, setMeta } from '../db'
import { buildContractRows, needsAttention } from './contracts'
import { renewalLevel } from './rent'
import {
  DEFAULT_RENEWAL_NOTICE_DAYS,
  parseRenewalNoticeDays,
  readRenewalNoticeDays,
  readSettings,
  RENEWAL_NOTICE_KEY,
  saveRenewalNoticeDays,
} from './settings'

/**
 * 設定の試験
 *
 * 設定ひとつのせいで画面が開かなくなるのがいちばん困る。
 * 壊れた値が入っていても、黙って既定値に戻ることを重点的に確かめる。
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

describe('parseRenewalNoticeDays', () => {
  it('選べる日数はそのまま通す', () => {
    expect(parseRenewalNoticeDays('30')).toBe(30)
    expect(parseRenewalNoticeDays('60')).toBe(60)
    expect(parseRenewalNoticeDays('90')).toBe(90)
  })

  it('入っていなければ既定値', () => {
    expect(parseRenewalNoticeDays(undefined)).toBe(DEFAULT_RENEWAL_NOTICE_DAYS)
  })

  it('壊れた値でも既定値に戻すだけで、投げない', () => {
    expect(parseRenewalNoticeDays('')).toBe(60)
    expect(parseRenewalNoticeDays('あいうえお')).toBe(60)
    expect(parseRenewalNoticeDays('-5')).toBe(60)
    expect(parseRenewalNoticeDays('9999')).toBe(60)
    expect(parseRenewalNoticeDays('45')).toBe(60) // 選べない日数
  })
})

describe('設定の読み書き', () => {
  beforeEach(async () => {
    await db.open()
    await db.meta.clear()
  })

  it('何も決めていなければ60日前', async () => {
    expect(await readRenewalNoticeDays()).toBe(60)
    expect(await readSettings()).toStrictEqual({ renewalNoticeDays: 60 })
  })

  it('選んだ日数が残る', async () => {
    await saveRenewalNoticeDays(90)
    expect(await readRenewalNoticeDays()).toBe(90)
  })

  it('選べない日数を渡されても、既定値に落として保存する', async () => {
    await saveRenewalNoticeDays(45)
    expect(await readRenewalNoticeDays()).toBe(60)
  })

  it('別の設定（最後に送った日）を壊さない', async () => {
    await setMeta('lastShareAt', '2026-08-11')
    await saveRenewalNoticeDays(30)
    expect((await db.meta.get('lastShareAt'))?.value).toBe('2026-08-11')
    expect(await readRenewalNoticeDays()).toBe(30)
  })

  it('控えから戻ってきた壊れた値でも、画面は開ける', async () => {
    await setMeta(RENEWAL_NOTICE_KEY, 'こわれた値')
    expect(await readRenewalNoticeDays()).toBe(60)
  })
})

describe('設定が更新のお知らせに効く', () => {
  // 2026-08-11 から見て、あと50日（9月30日）で終わる契約
  const rows = (noticeDays?: number) =>
    buildContractRows({
      leases: [{
        id: 'l-1', ...base, roomId: 'r-1', tenantId: 't-1',
        startDate: '2021-10-01', endDate: '2026-09-30', deposit: 0, keyMoney: 0,
      }],
      rooms: [{ id: 'r-1', ...base, roomNo: '103', floor: 1, sortOrder: 1 }],
      tenants: [{ id: 't-1', ...base, name: '佐藤 花子', kana: 'さとう はなこ' }],
      rentTerms: [{ id: 'rt-1', ...base, leaseId: 'l-1', fromMonth: '2021-10', rent: 62000, mgmtFee: 3000 }],
      from: '2026-08-11',
      noticeDays,
    })

  it('30日前にすると、あと50日の契約は知らせに出ない', () => {
    expect(needsAttention(rows(30))).toStrictEqual([])
  })

  it('60日前（既定）なら出る', () => {
    expect(needsAttention(rows(60))).toHaveLength(1)
    expect(rows(60)[0].level).toBe('yellow')
  })

  it('90日前でも出る', () => {
    expect(needsAttention(rows(90))).toHaveLength(1)
  })

  it('渡さなければ、これまでどおり60日前で動く', () => {
    expect(needsAttention(rows())).toHaveLength(1)
  })
})

describe('renewalLevel と設定', () => {
  it('残り1か月を切ったら、どの設定でも赤', () => {
    expect(renewalLevel('2026-09-05', '2026-08-11', 90).level).toBe('red') // あと25日
    expect(renewalLevel('2026-09-05', '2026-08-11', 30).level).toBe('red')
  })

  it('知らせ始める日数を短くすると、その手前は何も出ない', () => {
    // あと50日
    expect(renewalLevel('2026-09-30', '2026-08-11', 30).level).toBe('none')
    expect(renewalLevel('2026-09-30', '2026-08-11', 60).level).toBe('yellow')
  })

  it('30日前を選んだら、出たものはすべて赤になる', () => {
    expect(renewalLevel('2026-09-05', '2026-08-11', 30).level).toBe('red') // あと25日
    expect(renewalLevel('2026-09-10', '2026-08-11', 30).level).toBe('red') // ちょうど30日
    expect(renewalLevel('2026-09-11', '2026-08-11', 30).level).toBe('none') // 31日はもう出ない
  })

  it('過ぎているものは、どの設定でも赤', () => {
    const r = renewalLevel('2026-08-01', '2026-08-11', 90)
    expect(r.level).toBe('red')
    expect(r.days).toBe(-10)
  })

  // 既定値の置き場は1つ。ここが外れたら、設定を変えても片方だけ古い日数で動く
  it('渡さなかったときの日数は、設定の既定値と必ず同じ', () => {
    // あと50日（30日前と60日前で分かれる）と、あと75日（60日前と90日前で分かれる）。
    // この2つで見れば、選べる3つのどれにずれても気づける
    for (const endDate of ['2026-09-30', '2026-10-25']) {
      expect(renewalLevel(endDate, '2026-08-11').level)
        .toBe(renewalLevel(endDate, '2026-08-11', DEFAULT_RENEWAL_NOTICE_DAYS).level)
    }
  })
})

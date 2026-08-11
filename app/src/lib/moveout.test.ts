// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Lease, type MoveOut, type Room, type Tenant } from '../db'
import {
  addDeduction,
  buildSteps,
  NOTICE_DAYS,
  pendingMoveOuts,
  readMoveOut,
  remainingCount,
  removeDeduction,
  setMoveOutMemo,
  settle,
  STEPS,
  toggleStep,
} from './moveout'

/**
 * 退去の立会いと敷金の精算の試験
 *
 * 敷金は返す義務のあるお金。数え違いがそのまま揉めごとになる。
 * とくに「返す額がマイナスにならない」ことと、
 * 古い退去がいつまでも知らせに出ないことを確かめる。
 */

const T = '2026-01-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const lease = (id: string, extra: Partial<Lease> = {}): Lease => ({
  id, ...base, roomId: 'r-101', tenantId: 't-101',
  startDate: '2020-04-01', endDate: '2026-03-31', deposit: 120000, keyMoney: 60000, ...extra,
})

const room: Room = { id: 'r-101', ...base, roomNo: '101', floor: 1, sortOrder: 1 }
const tenant: Tenant = { id: 't-101', ...base, name: '田中 一郎', kana: 'たなか いちろう' }

const moveOut = (leaseId: string, extra: Partial<MoveOut> = {}): MoveOut => ({
  id: `m-${leaseId}`, ...base, leaseId, done: [], deductions: [], ...extra,
})

describe('settle', () => {
  it('差し引きが無ければ、敷金をそのまま返す', () => {
    expect(settle(120000, [])).toStrictEqual({
      deposit: 120000, deducted: 0, refund: 120000, shortfall: 0,
    })
  })

  it('差し引いた残りを返す', () => {
    const r = settle(120000, [
      { id: 'd-1', title: 'クロスの張り替え', amount: 48000, reason: 'タバコのヤニ' },
      { id: 'd-2', title: 'ハウスクリーニング', amount: 22000, reason: '通常の清掃' },
    ])
    expect(r.deducted).toBe(70000)
    expect(r.refund).toBe(50000)
    expect(r.shortfall).toBe(0)
  })

  it('ちょうど使い切ったら、返す額は0', () => {
    const r = settle(50000, [{ id: 'd-1', title: '補修', amount: 50000, reason: '床の傷' }])
    expect(r.refund).toBe(0)
    expect(r.shortfall).toBe(0)
  })

  it('敷金で足りないぶんは、返す額をマイナスにせず「足りない額」に出す', () => {
    // 返す額が「−3万円」では、返すのか請求するのか読み取れない
    const r = settle(120000, [{ id: 'd-1', title: '床の張り替え', amount: 150000, reason: '水漏れ跡' }])
    expect(r.refund).toBe(0)
    expect(r.shortfall).toBe(30000)
  })

  it('敷金が0でも壊れない', () => {
    expect(settle(0, [])).toStrictEqual({ deposit: 0, deducted: 0, refund: 0, shortfall: 0 })
  })
})

describe('buildSteps と remainingCount', () => {
  it('何もしていなければ、全部が未', () => {
    const steps = buildSteps(undefined)
    expect(steps).toHaveLength(STEPS.length)
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(remainingCount(undefined)).toBe(STEPS.length)
  })

  it('済ませたものに印がつく', () => {
    const steps = buildSteps(moveOut('l-1', { done: ['keys', 'photos'] }))
    expect(steps.find((s) => s.key === 'keys')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'photos')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'refunded')?.done).toBe(false)
    expect(remainingCount(moveOut('l-1', { done: ['keys', 'photos'] }))).toBe(STEPS.length - 2)
  })

  it('全部済ませたら残りは0', () => {
    expect(remainingCount(moveOut('l-1', { done: STEPS.map((s) => s.key) }))).toBe(0)
  })

  it('知らない印が混ざっていても、数を狂わせない', () => {
    // 古い控えを読み込んだときに、いまは無い手順の印が入っていることがある
    expect(remainingCount(moveOut('l-1', { done: ['むかしの手順'] }))).toBe(STEPS.length)
  })
})

describe('pendingMoveOuts', () => {
  const input = (leases: Lease[], moveOuts: MoveOut[] = []) =>
    pendingMoveOuts({ leases, rooms: [room], tenants: [tenant], moveOuts, from: '2026-08-11' })

  it('退去したのに手続きが終わっていないものを出す', () => {
    const rows = input([lease('l-1', { movedOutOn: '2026-07-31' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].remaining).toBe(STEPS.length)
    expect(rows[0].daysSince).toBe(11)
    expect(rows[0].room?.roomNo).toBe('101')
    expect(rows[0].tenant?.name).toBe('田中 一郎')
  })

  it('まだ退去していない契約は出さない', () => {
    expect(input([lease('l-1')])).toStrictEqual([])
  })

  it('退去日がこれからのものは出さない', () => {
    expect(input([lease('l-1', { movedOutOn: '2026-09-30' })])).toStrictEqual([])
  })

  it('全部済ませたら出さない', () => {
    const rows = input(
      [lease('l-1', { movedOutOn: '2026-07-31' })],
      [moveOut('l-1', { done: STEPS.map((s) => s.key) })],
    )
    expect(rows).toStrictEqual([])
  })

  it('180日を過ぎた古い退去は出さない（知らせ全体が読み飛ばされるため）', () => {
    const old = input([lease('l-1', { movedOutOn: '2026-02-01' })]) // 191日前
    expect(old).toStrictEqual([])
    const edge = input([lease('l-2', { movedOutOn: '2026-02-12' })]) // 180日前
    expect(edge).toHaveLength(1)
    expect(edge[0].daysSince).toBe(NOTICE_DAYS)
  })

  it('古い退去から順に出す', () => {
    const rows = input([
      lease('new', { movedOutOn: '2026-08-01' }),
      lease('old', { movedOutOn: '2026-06-01' }),
    ])
    expect(rows.map((r) => r.lease.id)).toEqual(['old', 'new'])
  })

  it('消した契約は出さない', () => {
    expect(input([lease('l-1', { movedOutOn: '2026-07-31', deletedAt: T })])).toStrictEqual([])
  })
})

describe('退去の記録（読み書き）', () => {
  beforeEach(async () => {
    await db.open()
    await db.moveOuts.clear()
  })

  it('手順を押すまで、行は作られない', async () => {
    expect(await readMoveOut('l-1')).toBeUndefined()
    expect(await db.moveOuts.count()).toBe(0)
  })

  it('手順を押すと、済になる', async () => {
    await toggleStep('l-1', 'keys')
    expect((await readMoveOut('l-1'))?.done).toStrictEqual(['keys'])
  })

  it('もう一度押すと、未に戻る（押しまちがえても直せる）', async () => {
    await toggleStep('l-1', 'keys')
    await toggleStep('l-1', 'keys')
    expect((await readMoveOut('l-1'))?.done).toStrictEqual([])
  })

  it('1つの契約に、行は1つしかできない', async () => {
    await toggleStep('l-1', 'keys')
    await toggleStep('l-1', 'photos')
    await toggleStep('l-1', 'utilities')
    expect(await db.moveOuts.count()).toBe(1)
  })

  it('立て続けに押しても、どれも取りこぼさない', async () => {
    // 立会いの場で手順を続けて押すと、前の書き込みが終わる前に次が始まる。
    // 「読んでから作る」を別々にやっていると、両方が「まだ無い」と見て
    // 2行を入れようとし、後のほうが弾かれて、押したはずの手順が消える
    await Promise.all([
      toggleStep('l-1', 'keys'),
      toggleStep('l-1', 'photos'),
      toggleStep('l-1', 'inspected'),
    ])
    expect(await db.moveOuts.count()).toBe(1)
    expect((await readMoveOut('l-1'))?.done.sort())
      .toStrictEqual(['inspected', 'keys', 'photos'])
  })

  it('差し引きを立て続けに足しても、どれも残る', async () => {
    await Promise.all([
      addDeduction('l-1', { title: 'クロス', amount: 30000, reason: '大きな傷' }),
      addDeduction('l-1', { title: '鍵', amount: 8000, reason: '1本が返らなかった' }),
    ])
    expect(await db.moveOuts.count()).toBe(1)
    expect((await readMoveOut('l-1'))?.deductions).toHaveLength(2)
  })

  it('「敷金を返した」を押した日が、返した日として残る', async () => {
    await toggleStep('l-1', 'refunded')
    expect((await readMoveOut('l-1'))?.refundedOn).toBeTruthy()
  })

  it('「敷金を返した」を取り消すと、返した日も消える', async () => {
    await toggleStep('l-1', 'refunded')
    await toggleStep('l-1', 'refunded')
    const row = await readMoveOut('l-1')
    expect(row?.refundedOn).toBeUndefined()
    expect('refundedOn' in (row ?? {})).toBe(false)
  })

  it('差し引きを足せる。理由も一緒に残る', async () => {
    await addDeduction('l-1', {
      title: '  クロスの張り替え（居室）  ',
      amount: 48000,
      reason: '  タバコのヤニで全面の張り替えが要った。入居時の写真と見くらべて判断  ',
    })
    const row = await readMoveOut('l-1')
    expect(row?.deductions).toHaveLength(1)
    expect(row?.deductions[0].title).toBe('クロスの張り替え（居室）')
    expect(row?.deductions[0].reason).toContain('タバコのヤニ')
  })

  it('差し引きを消せる', async () => {
    const id = await addDeduction('l-1', { title: 'A', amount: 1000, reason: 'あ' })
    await addDeduction('l-1', { title: 'B', amount: 2000, reason: 'い' })
    await removeDeduction('l-1', id)
    const row = await readMoveOut('l-1')
    expect(row?.deductions.map((d) => d.title)).toStrictEqual(['B'])
  })

  it('覚え書きを残せる。空にすれば鍵ごと落ちる', async () => {
    await setMoveOutMemo('l-1', '  次の入居までに給湯器も見ておく  ')
    expect((await readMoveOut('l-1'))?.memo).toBe('次の入居までに給湯器も見ておく')
    await setMoveOutMemo('l-1', '   ')
    expect('memo' in ((await readMoveOut('l-1')) ?? {})).toBe(false)
  })

  it('手順と差し引きは、同じ行にまとまる', async () => {
    await toggleStep('l-1', 'keys')
    await addDeduction('l-1', { title: 'A', amount: 1000, reason: 'あ' })
    const row = await readMoveOut('l-1')
    expect(row?.done).toStrictEqual(['keys'])
    expect(row?.deductions).toHaveLength(1)
    expect(await db.moveOuts.count()).toBe(1)
  })
})

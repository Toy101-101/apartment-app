// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { togglePaid, undoToggle } from './payments'

/**
 * 「済／未」の切りかえの試験
 *
 * ここで守りたいのは金額そのものより、
 * 「押しまちがえても必ず元に戻せる」ことと「触った記録が残る」こと。
 */

const LEASE = 'lease-1'
const MONTH = '2026-08'
const DUE = 58000

const toggle = () =>
  togglePaid({ leaseId: LEASE, month: MONTH, due: DUE, roomNo: '101', paidOn: '2026-08-03' })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('済と未の切りかえ', () => {
  it('未の月には行が無い（作り置きしない）', async () => {
    expect(await db.payments.count()).toBe(0)
  })

  it('1回目で「済」になり、その月の行ができる', async () => {
    const r = await toggle()
    expect(r.after.paidOn).toBe('2026-08-03')
    expect(r.after.amount).toBe(DUE)
    expect(r.message).toBe('101号室を「済」にしました')
    expect(await db.payments.count()).toBe(1)
  })

  it('もう1回押すと「未」に戻る（行は残す）', async () => {
    await toggle()
    const r = await toggle()
    expect(r.after.paidOn).toBeUndefined()
    expect(r.message).toBe('101号室を「未」にしました')
    expect(await db.payments.count()).toBe(1)
  })

  it('未に戻しても、金額とメモは消えない', async () => {
    await toggle()
    const row = await db.payments.where('[leaseId+month]').equals([LEASE, MONTH]).first()
    await db.payments.put({ ...row!, memo: '手渡しで受け取った' })

    await toggle()
    const after = await db.payments.get(row!.id)
    expect(after?.memo).toBe('手渡しで受け取った')
    expect(after?.amount).toBe(DUE)
    expect(after?.paidOn).toBeUndefined()
  })

  it('何度押しても行は1つのまま', async () => {
    for (let i = 0; i < 5; i++) await toggle()
    expect(await db.payments.count()).toBe(1)
  })

  it('月が違えば別の行になる', async () => {
    await toggle()
    await togglePaid({ leaseId: LEASE, month: '2026-09', due: DUE, roomNo: '101' })
    expect(await db.payments.count()).toBe(2)
  })
})

describe('操作の履歴', () => {
  it('押すたびに、誰が・いつ・何をしたかが残る', async () => {
    await toggle()
    await toggle()
    const log = await db.paymentLog.orderBy('at').toArray()
    expect(log.map((l) => l.action)).toStrictEqual(['markPaid', 'markUnpaid'])
    expect(log[0].who).toBe('この端末')
  })

  it('変える前の姿も残るので、後から追える', async () => {
    await toggle()
    await toggle()
    const log = await db.paymentLog.orderBy('at').toArray()
    expect(log[0].before).toBeUndefined() // 1回目は行そのものが無かった
    expect(JSON.parse(log[1].before!).paidOn).toBe('2026-08-03')
  })

  it('記録した人の名前を変えられる', async () => {
    await togglePaid({ leaseId: LEASE, month: MONTH, due: DUE, roomNo: '101', who: '祖父' })
    expect((await db.paymentLog.toArray())[0].who).toBe('祖父')
  })
})

describe('取り消し', () => {
  it('作ったばかりの行は、取り消すと消える（押す前と同じ状態に戻る）', async () => {
    const r = await toggle()
    await undoToggle(r)
    expect(await db.payments.count()).toBe(0)
  })

  it('済 → 未 を取り消すと、済に戻る', async () => {
    await toggle()
    const off = await toggle()
    await undoToggle(off)

    const row = await db.payments.where('[leaseId+month]').equals([LEASE, MONTH]).first()
    expect(row?.paidOn).toBe('2026-08-03')
  })

  it('取り消したこと自体も履歴に残る（無かったことにはしない）', async () => {
    const r = await toggle()
    await undoToggle(r)
    const log = await db.paymentLog.orderBy('at').toArray()
    expect(log.map((l) => l.action)).toStrictEqual(['markPaid', 'undo'])
  })

  it('取り消しのあと、もう一度押せばまた済にできる', async () => {
    const r = await toggle()
    await undoToggle(r)
    const again = await toggle()
    expect(again.after.paidOn).toBe('2026-08-03')
    expect(await db.payments.count()).toBe(1)
  })
})

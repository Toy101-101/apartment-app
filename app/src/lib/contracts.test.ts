// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import {
  addNote, buildContractRows, cancelEndLease, changeRent, createContract, endLease,
  needsAttention, removeNote, renewLease, renewalText, sortNotes, updateContract,
  type ContractInput,
} from './contracts'
import { buildMonthRows } from './rent'

/**
 * ①入居者・契約の試験
 *
 * いちばん守りたいのは「**上書きしない**」こと。
 * 家賃を変えても、契約を更新しても、退去しても、前の記録が読めること。
 */

const INPUT: ContractInput = {
  roomNo: '101',
  name: '見本 太郎', kana: 'みほん たろう', phone: '090-0000-0000',
  guarantorName: '見本 花子', guarantorPhone: '090-1111-1111',
  contactNote: '耳が遠いので手紙が確実',
  startDate: '2024-04-01', endDate: '2026-03-31',
  deposit: 110000, keyMoney: 55000,
  rent: 55000, mgmtFee: 3000,
}

async function rowsNow(from: string) {
  const [leases, rooms, tenants, rentTerms] = await Promise.all([
    db.leases.toArray(), db.rooms.toArray(), db.tenants.toArray(), db.rentTerms.toArray(),
  ])
  return buildContractRows({ leases, rooms, tenants, rentTerms, from })
}

/** その月の家賃（②の画面と同じ道すじで確かめる） */
async function dueOfMonth(month: string, roomNo: string) {
  const [rooms, leases, tenants, rentTerms, payments] = await Promise.all([
    db.rooms.toArray(), db.leases.toArray(), db.tenants.toArray(),
    db.rentTerms.toArray(), db.payments.where('month').equals(month).toArray(),
  ])
  return buildMonthRows({ month, rooms, leases, tenants, rentTerms, payments })
    .find((r) => r.room.roomNo === roomNo)
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('契約を登録する', () => {
  it('部屋・入居者・契約・家賃がひとそろい作られる', async () => {
    await createContract(INPUT)
    expect(await db.rooms.count()).toBe(1)
    expect(await db.tenants.count()).toBe(1)
    expect(await db.leases.count()).toBe(1)
    expect(await db.rentTerms.count()).toBe(1)
  })

  it('部屋番号は鍵にしない（部屋にも id がつく）', async () => {
    const leaseId = await createContract(INPUT)
    const lease = await db.leases.get(leaseId)
    const room = await db.rooms.get(lease!.roomId)
    expect(room?.roomNo).toBe('101')
    expect(lease!.roomId).not.toBe('101')
  })

  it('同じ部屋番号で2件目を登録しても、部屋は増えない', async () => {
    await createContract(INPUT)
    await createContract({ ...INPUT, name: '見本 次郎', kana: 'みほん じろう', startDate: '2026-04-01', endDate: '2028-03-31' })
    expect(await db.rooms.count()).toBe(1)
    expect(await db.tenants.count()).toBe(2)
  })

  it('部屋番号から階と並び順が決まる', async () => {
    await createContract({ ...INPUT, roomNo: '204' })
    const room = (await db.rooms.toArray())[0]
    expect(room.floor).toBe(2)
    expect(room.sortOrder).toBe(204)
  })

  it('空の欄は持たせない（控えの中身が揺れないように）', async () => {
    await createContract({ ...INPUT, phone: '  ', contactNote: '' })
    const tenant = (await db.tenants.toArray())[0]
    expect('phone' in tenant).toBe(false)
    expect('contactNote' in tenant).toBe(false)
  })

  it('登録したその月から、②の画面に家賃が出る', async () => {
    await createContract(INPUT)
    expect((await dueOfMonth('2024-04', '101'))?.due).toBe(58000)
    expect((await dueOfMonth('2024-03', '101'))?.lease).toBeUndefined()
  })
})

describe('書きまちがいを直す', () => {
  it('名前や敷金を直せる', async () => {
    const id = await createContract(INPUT)
    await updateContract(id, { ...INPUT, name: '見本 太朗', deposit: 120000 })

    expect((await db.tenants.toArray())[0].name).toBe('見本 太朗')
    expect((await db.leases.get(id))?.deposit).toBe(120000)
  })

  it('入居者の行は増えない（別人になってしまわない）', async () => {
    const id = await createContract(INPUT)
    await updateContract(id, { ...INPUT, name: '見本 太朗' })
    expect(await db.tenants.count()).toBe(1)
  })

  it('部屋を移っても、前の部屋は消えない', async () => {
    const id = await createContract(INPUT)
    await updateContract(id, { ...INPUT, roomNo: '102' })
    expect(await db.rooms.count()).toBe(2)
    const lease = await db.leases.get(id)
    expect((await db.rooms.get(lease!.roomId))?.roomNo).toBe('102')
  })

  it('直しても家賃は動かない（下げた理由が消えないように）', async () => {
    const id = await createContract(INPUT)
    await changeRent(id, { fromMonth: '2025-04', rent: 53000, mgmtFee: 3000, reason: '2,000円下げた' })
    await updateContract(id, { ...INPUT, rent: 99999 })

    expect(await db.rentTerms.count()).toBe(2)
    expect((await dueOfMonth('2025-04', '101'))?.due).toBe(56000)
  })
})

describe('家賃を変える', () => {
  it('前の額は消えず、行が足される', async () => {
    const id = await createContract(INPUT)
    await changeRent(id, { fromMonth: '2025-04', rent: 53000, mgmtFee: 3000, reason: '長く住んでもらっているので2,000円下げた' })

    const terms = await db.rentTerms.orderBy('leaseId').toArray()
    expect(terms).toHaveLength(2)
    expect(terms.some((t) => t.rent === 55000)).toBe(true)
  })

  it('変えた理由が残る', async () => {
    const id = await createContract(INPUT)
    await changeRent(id, { fromMonth: '2025-04', rent: 53000, mgmtFee: 3000, reason: '2,000円下げた' })
    const changed = (await db.rentTerms.toArray()).find((t) => t.rent === 53000)
    expect(changed?.reason).toBe('2,000円下げた')
  })

  it('過去の月をひらけば、当時の額のまま出る', async () => {
    const id = await createContract(INPUT)
    await changeRent(id, { fromMonth: '2025-04', rent: 53000, mgmtFee: 3000 })

    expect((await dueOfMonth('2025-03', '101'))?.due).toBe(58000)
    expect((await dueOfMonth('2025-04', '101'))?.due).toBe(56000)
  })
})

describe('契約を更新する', () => {
  it('前の契約はそのまま残り、翌日から新しい契約が始まる', async () => {
    const id = await createContract(INPUT)
    const next = await renewLease(id, { endDate: '2028-03-31' })

    expect(await db.leases.count()).toBe(2)
    expect((await db.leases.get(id))?.endDate).toBe('2026-03-31')
    expect((await db.leases.get(next))?.startDate).toBe('2026-04-01')
  })

  it('部屋と入居者は引き継ぐ', async () => {
    const id = await createContract(INPUT)
    const next = await renewLease(id, { endDate: '2028-03-31' })
    const [before, after] = await Promise.all([db.leases.get(id), db.leases.get(next)])
    expect(after?.roomId).toBe(before?.roomId)
    expect(after?.tenantId).toBe(before?.tenantId)
  })

  it('家賃を据え置けば、同じ額が引き継がれる', async () => {
    const id = await createContract(INPUT)
    await renewLease(id, { endDate: '2028-03-31' })
    expect((await dueOfMonth('2026-04', '101'))?.due).toBe(58000)
  })

  it('更新のときに家賃を下げられる（理由つき）', async () => {
    const id = await createContract(INPUT)
    await renewLease(id, { endDate: '2028-03-31', rent: 53000, mgmtFee: 3000, reason: '長く住んでもらっているので2,000円下げた' })

    expect((await dueOfMonth('2026-03', '101'))?.due).toBe(58000) // 更新の前は前の額
    expect((await dueOfMonth('2026-04', '101'))?.due).toBe(56000) // 更新の後は新しい額
  })

  it('更新のときに礼金は取らない', async () => {
    const id = await createContract(INPUT)
    const next = await renewLease(id, { endDate: '2028-03-31' })
    expect((await db.leases.get(next))?.keyMoney).toBe(0)
    expect((await db.leases.get(next))?.deposit).toBe(110000)
  })

  it('更新のあとも、②の画面に切れ目なく出る', async () => {
    const id = await createContract(INPUT)
    await renewLease(id, { endDate: '2028-03-31' })
    for (const m of ['2026-02', '2026-03', '2026-04', '2026-05']) {
      expect((await dueOfMonth(m, '101'))?.due).toBeGreaterThan(0)
    }
  })
})

describe('退去と再入居', () => {
  it('退去しても契約は消えない', async () => {
    const id = await createContract(INPUT)
    await endLease(id, '2025-09-30')
    expect(await db.leases.count()).toBe(1)
    expect((await db.leases.get(id))?.movedOutOn).toBe('2025-09-30')
  })

  it('退去した翌月から、②の画面では空室になる', async () => {
    const id = await createContract(INPUT)
    await endLease(id, '2025-09-30')
    expect((await dueOfMonth('2025-09', '101'))?.lease).toBeDefined()
    expect((await dueOfMonth('2025-10', '101'))?.lease).toBeUndefined()
  })

  it('間違って退去にしたら取り消せる', async () => {
    const id = await createContract(INPUT)
    await endLease(id, '2025-09-30')
    await cancelEndLease(id)
    expect((await db.leases.get(id))?.movedOutOn).toBeUndefined()
    expect((await dueOfMonth('2025-10', '101'))?.lease).toBeDefined()
  })

  it('再入居は新しい契約になり、前の入居者の記録も残る', async () => {
    const first = await createContract(INPUT)
    await endLease(first, '2025-09-30')
    await createContract({
      ...INPUT, name: '見本 次郎', kana: 'みほん じろう',
      startDate: '2025-11-01', endDate: '2027-10-31', rent: 60000,
    })

    expect((await dueOfMonth('2025-08', '101'))?.tenant?.name).toBe('見本 太郎')
    expect((await dueOfMonth('2025-10', '101'))?.lease).toBeUndefined() // 空いていた月
    expect((await dueOfMonth('2025-11', '101'))?.tenant?.name).toBe('見本 次郎')
    expect((await dueOfMonth('2025-11', '101'))?.due).toBe(63000)
  })
})

describe('一覧の並びと知らせ', () => {
  const setup = async () => {
    await createContract({ ...INPUT, roomNo: '101', endDate: '2027-01-15' })
    await createContract({ ...INPUT, roomNo: '102', name: '乙', kana: 'おつ', endDate: '2026-08-25' })
    await createContract({ ...INPUT, roomNo: '103', name: '丙', kana: 'へい', endDate: '2026-09-30' })
  }

  it('更新が近い順に並ぶ', async () => {
    await setup()
    const rows = await rowsNow('2026-08-11')
    expect(rows.map((r) => r.room?.roomNo)).toStrictEqual(['102', '103', '101'])
  })

  it('30日以内は赤、60日以内は黄', async () => {
    await setup()
    const rows = await rowsNow('2026-08-11')
    expect(rows.map((r) => r.level)).toStrictEqual(['red', 'yellow', 'none'])
  })

  it('知らせるのは60日以内の契約だけ', async () => {
    await setup()
    const rows = await rowsNow('2026-08-11')
    expect(needsAttention(rows).map((r) => r.room?.roomNo)).toStrictEqual(['102', '103'])
  })

  it('終わった契約は下にまわり、知らせにも出ない', async () => {
    await setup()
    const rows0 = await rowsNow('2026-08-11')
    await endLease(rows0[0].lease.id, '2026-08-01')

    const rows = await rowsNow('2026-08-11')
    expect(rows[rows.length - 1].room?.roomNo).toBe('102')
    expect(rows[rows.length - 1].living).toBe(false)
    expect(needsAttention(rows).map((r) => r.room?.roomNo)).toStrictEqual(['103'])
  })

  it('一覧にはその月の家賃が出る', async () => {
    await setup()
    const rows = await rowsNow('2026-08-11')
    expect(rows[0].rent).toBe(58000)
    expect(rows[0].tenant?.name).toBe('乙')
  })

  it('更新して作った先の契約は「これから始まる」扱いで、家賃も0円にならない', async () => {
    const id = await createContract({ ...INPUT, endDate: '2026-09-30' })
    await renewLease(id, { endDate: '2028-09-30', rent: 60000, mgmtFee: 3000 })

    const rows = await rowsNow('2026-08-11')
    const next = rows.find((r) => r.future)
    expect(next).toBeDefined()
    expect(next!.living).toBe(true)
    // まだ始まっていないので「今月の家賃」は無い。始まる月の額を出す
    expect(next!.rent).toBe(63000)
  })

  it('これから始まる契約は、更新の知らせに出さない（更新はもう済んでいる）', async () => {
    const id = await createContract({ ...INPUT, endDate: '2026-09-30' })
    await renewLease(id, { endDate: '2028-09-30' })

    const rows = await rowsNow('2026-08-11')
    expect(needsAttention(rows).map((r) => r.lease.id)).toStrictEqual([id])
  })

  it('言葉は、状態ごとに変わる', async () => {
    const id = await createContract({ ...INPUT, endDate: '2026-09-30' })
    await renewLease(id, { endDate: '2028-09-30' })

    const rows = await rowsNow('2026-08-11')
    expect(renewalText(rows.find((r) => !r.future)!)).toBe('あと50日で契約更新')
    expect(renewalText(rows.find((r) => r.future)!)).toBe('令和8年10月1日（木）から始まります')
  })
})

describe('いきさつメモ', () => {
  it('契約に結びつけて残せる', async () => {
    const id = await createContract(INPUT)
    await addNote({ targetType: 'lease', targetId: id, body: '雨漏りの相談を受けた', author: '祖父', date: '2026-07-20' })

    const notes = await db.notes.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe('雨漏りの相談を受けた')
    expect(notes[0].byVoice).toBe(false)
  })

  it('新しい順に並ぶ（同じ日なら書いた順の逆）', async () => {
    const id = await createContract(INPUT)
    await addNote({ targetType: 'lease', targetId: id, body: '古い', date: '2026-01-01' })
    await addNote({ targetType: 'lease', targetId: id, body: '同じ日の1件目', date: '2026-07-20' })
    await addNote({ targetType: 'lease', targetId: id, body: '同じ日の2件目', date: '2026-07-20' })

    expect(sortNotes(await db.notes.toArray()).map((n) => n.body))
      .toStrictEqual(['同じ日の2件目', '同じ日の1件目', '古い'])
  })

  it('消しても行は残る（論理削除）', async () => {
    const id = await createContract(INPUT)
    await addNote({ targetType: 'lease', targetId: id, body: '消すメモ' })
    const note = (await db.notes.toArray())[0]
    await removeNote(note.id)

    expect(await db.notes.count()).toBe(1)
    expect(sortNotes(await db.notes.toArray())).toStrictEqual([])
  })
})

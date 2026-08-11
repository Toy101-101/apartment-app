import { db, type Lease, type Note, type Payment, type RentTerm, type Room, type Tenant } from '../db'

/**
 * 見本データ（架空の10部屋）
 *
 * 入居者を登録する画面ができたので、**入れるボタンは画面から外した**。
 * 本物の記録が入っている端末で誤って押されたら、全部消えてしまうため。
 * いまも残してあるのは次の2つのため。
 *
 * 1. 試験（`sample.test.ts`）で、現実に近い10部屋ぶんの計算を毎回確かめる
 * 2. すでに見本を入れてしまった端末から、**見本だけを選んで消す**（`removeSample`）
 *
 * 名前・電話番号はすべて**架空**（mockup.html と同じ顔ぶれ）。実在の入居者は入れない。
 */

const T = '2026-08-01T00:00:00.000Z'
const base = { createdAt: T, updatedAt: T }

const rooms: Room[] = [
  { id: 'r-101', ...base, roomNo: '101', floor: 1, sortOrder: 1 },
  { id: 'r-102', ...base, roomNo: '102', floor: 1, sortOrder: 2, memo: '2026年6月末に退去。給湯器は新品に交換済み' },
  { id: 'r-103', ...base, roomNo: '103', floor: 1, sortOrder: 3, memo: '角部屋。日当たりが良い' },
  { id: 'r-104', ...base, roomNo: '104', floor: 1, sortOrder: 4 },
  { id: 'r-105', ...base, roomNo: '105', floor: 1, sortOrder: 5 },
  { id: 'r-201', ...base, roomNo: '201', floor: 2, sortOrder: 6 },
  { id: 'r-202', ...base, roomNo: '202', floor: 2, sortOrder: 7 },
  { id: 'r-203', ...base, roomNo: '203', floor: 2, sortOrder: 8, memo: 'エアコンが古い。次の入居までに交換を検討' },
  { id: 'r-204', ...base, roomNo: '204', floor: 2, sortOrder: 9 },
  { id: 'r-205', ...base, roomNo: '205', floor: 2, sortOrder: 10 },
]

const tenants: Tenant[] = [
  { id: 't-101', ...base, name: '田中 一郎', kana: 'たなか いちろう', phone: '090-1234-5678',
    guarantorName: '田中 幸子（妻）', guarantorPhone: '090-1234-9999' },
  { id: 't-103', ...base, name: '佐藤 花子', kana: 'さとう はなこ', phone: '080-2222-3333',
    guarantorName: '佐藤 健（長男）', guarantorPhone: '080-2222-1111',
    contactNote: '入金が数日遅れることがあるが、これまで必ず月内に入っている。催促の電話はしないでよい、と本人と話がついている' },
  { id: 't-104', ...base, name: '鈴木 健太', kana: 'すずき けんた', phone: '090-4444-5555',
    guarantorName: '鈴木 正夫（父）', guarantorPhone: '0120-000-000' },
  { id: 't-105', ...base, name: '中村 良子', kana: 'なかむら りょうこ', phone: '090-6666-7777',
    guarantorName: '中村 明（弟）', guarantorPhone: '090-6666-1111',
    contactNote: '耳が少し遠いので、連絡は電話よりも訪問か手紙のほうが確実' },
  { id: 't-201', ...base, name: '山本 みどり', kana: 'やまもと みどり', phone: '080-8888-9999',
    guarantorName: '（保証会社）□□保証', guarantorPhone: '0120-111-222' },
  { id: 't-202', ...base, name: '高橋 悟', kana: 'たかはし さとる', phone: '090-1111-2222',
    guarantorName: '高橋 良江（母）',
    contactNote: '夜勤のため日中は寝ていることが多い。訪ねるなら夕方以降。入金は毎月25日ごろの手渡しが多いので月末までは待つ' },
  { id: 't-204', ...base, name: '伊藤 陽子', kana: 'いとう ようこ', phone: '080-3333-4444',
    guarantorName: '伊藤 誠（夫）', guarantorPhone: '080-3333-1111' },
  { id: 't-205', ...base, name: '小林 大輔', kana: 'こばやし だいすけ', phone: '090-5555-6666',
    guarantorName: '小林 一雄（父）' },
]

const lease = (
  no: string, startDate: string, endDate: string, deposit: number, keyMoney: number,
): Lease => ({
  id: `l-${no}`, ...base, roomId: `r-${no}`, tenantId: `t-${no}`,
  startDate, endDate, deposit, keyMoney,
})

const leases: Lease[] = [
  lease('101', '2018-04-01', '2026-08-25', 110000, 55000),
  lease('103', '2021-10-01', '2026-09-30', 124000, 62000),
  lease('104', '2024-03-15', '2027-03-31', 116000, 58000),
  lease('105', '2019-09-05', '2026-10-05', 112000, 0),
  lease('201', '2023-01-15', '2027-01-15', 120000, 60000),
  lease('202', '2022-06-01', '2026-11-30', 114000, 57000),
  lease('204', '2025-05-01', '2028-04-30', 122000, 61000),
  lease('205', '2020-11-01', '2026-10-31', 118000, 59000),
]

const term = (
  id: string, no: string, fromMonth: string, rent: number, reason?: string,
): RentTerm => ({ id, ...base, leaseId: `l-${no}`, fromMonth, rent, mgmtFee: 3000, reason })

const rentTerms: RentTerm[] = [
  // 101号室は家賃を下げた経緯を残してある。過去の月をひらけば当時の額が出る
  term('rt-101a', '101', '2018-04', 57000),
  term('rt-101b', '101', '2022-04', 55000, '長く住んでもらっているので、更新のときに2,000円下げた'),
  term('rt-103', '103', '2021-10', 62000, '角部屋で日当たりが良いぶん、他より高め'),
  term('rt-104', '104', '2024-03', 58000),
  term('rt-105', '105', '2019-09', 56000),
  term('rt-201', '201', '2023-01', 60000),
  term('rt-202', '202', '2022-06', 57000),
  term('rt-204', '204', '2025-05', 61000, '壁紙を張り替えたぶん、3,000円上げて募集した（58,000→61,000）'),
  term('rt-205', '205', '2020-11', 59000),
]

/** その月に済にする部屋。ここに無い部屋は「未」（行そのものを作らない） */
const PAID: Record<string, string[]> = {
  '2026-07': ['101', '103', '104', '105', '201', '202', '204', '205'],
  '2026-08': ['101', '104', '105', '201', '204', '205'], // 103と202がまだ
}

function buildPayments(): Payment[] {
  const rentOf = (no: string, month: string) =>
    rentTerms
      .filter((t) => t.leaseId === `l-${no}` && t.fromMonth <= month)
      .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))[0]

  const out: Payment[] = []
  for (const [month, nos] of Object.entries(PAID)) {
    for (const no of nos) {
      const t = rentOf(no, month)
      out.push({
        id: `pay-${month}-${no}`, ...base,
        leaseId: `l-${no}`, month, amount: t.rent + t.mgmtFee,
        paidOn: `${month}-05`, method: 'transfer',
      })
    }
  }
  return out
}

const notes: Note[] = [
  { id: 'n-1', ...base, targetType: 'lease', targetId: 'l-101', date: '2022-04-01', author: '祖父', byVoice: false,
    body: '最初の入居者さん。長く住んでもらっているので、更新のときに家賃を2,000円下げた（57,000→55,000）。\nゴミ出しの当番をいつも手伝ってくれる。困りごとがあると一番に電話をくれるので、こちらからも様子を聞くようにしている。' },
  { id: 'n-2', ...base, targetType: 'lease', targetId: 'l-104', date: '2024-03-15', author: '祖父', byVoice: false,
    body: 'ペット不可の物件だが、金魚のみ相談のうえで許可している（口約束なので記録として残す）。' },
  { id: 'n-3', ...base, targetType: 'lease', targetId: 'l-205', date: '2026-07-20', author: '祖父', byVoice: true,
    body: '転勤のため2026年9月30日で退去したいと電話で連絡を受けた。\n敷金は畳の傷み具合を見てから精算する約束。' },
  { id: 'n-4', ...base, targetType: 'room', targetId: 'r-102', date: '2026-06-30', author: '祖父', byVoice: false,
    body: '前の入居者（大学生）が卒業で退去。給湯器を新品に交換したので、募集のときは「給湯器新品」と出すこと。' },
]

/** 本体の表（写真とmetaを除く）をまとめて入れかえる */
export async function loadSample(): Promise<void> {
  await db.transaction(
    'rw',
    [db.rooms, db.tenants, db.leases, db.rentTerms, db.payments, db.paymentLog, db.expenses, db.notes],
    async () => {
      await Promise.all([
        db.rooms.clear(), db.tenants.clear(), db.leases.clear(), db.rentTerms.clear(),
        db.payments.clear(), db.paymentLog.clear(), db.expenses.clear(), db.notes.clear(),
      ])
      await db.rooms.bulkPut(rooms)
      await db.tenants.bulkPut(tenants)
      await db.leases.bulkPut(leases)
      await db.rentTerms.bulkPut(rentTerms)
      await db.payments.bulkPut(buildPayments())
      await db.notes.bulkPut(notes)
    },
  )
}

/** 本体の表を空にする（meta は残す）。試験でだけ使う */
export async function clearSample(): Promise<void> {
  await db.transaction(
    'rw',
    [db.rooms, db.tenants, db.leases, db.rentTerms, db.payments, db.paymentLog, db.expenses, db.notes],
    async () => {
      await Promise.all([
        db.rooms.clear(), db.tenants.clear(), db.leases.clear(), db.rentTerms.clear(),
        db.payments.clear(), db.paymentLog.clear(), db.expenses.clear(), db.notes.clear(),
      ])
    },
  )
}

/** 見本データが入っているか（入っている端末にだけ、消す案内を出すため） */
export async function hasSampleData(): Promise<boolean> {
  return (await db.rooms.get(rooms[0].id)) !== undefined
}

/**
 * 見本データ**だけ**を消す。
 *
 * 本物の記録の id は `crypto.randomUUID()`（16進数）なので、
 * `r-101` のような見本の id とぶつかることは無い。だから取りちがえて消す心配がない。
 */
export async function removeSample(): Promise<void> {
  const payments = buildPayments()
  await db.transaction(
    'rw',
    [db.rooms, db.tenants, db.leases, db.rentTerms, db.payments, db.paymentLog, db.notes],
    async () => {
      // 見本の入金に対してつけた操作の履歴も、一緒に片づける
      const paymentIds = new Set(payments.map((p) => p.id))
      const logs = await db.paymentLog.toArray()
      await db.paymentLog.bulkDelete(logs.filter((l) => paymentIds.has(l.paymentId)).map((l) => l.id))

      await db.rooms.bulkDelete(rooms.map((r) => r.id))
      await db.tenants.bulkDelete(tenants.map((t) => t.id))
      await db.leases.bulkDelete(leases.map((l) => l.id))
      await db.rentTerms.bulkDelete(rentTerms.map((t) => t.id))
      await db.payments.bulkDelete(payments.map((p) => p.id))
      await db.notes.bulkDelete(notes.map((n) => n.id))
    },
  )
}

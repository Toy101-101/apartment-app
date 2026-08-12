import {
  db,
  type Equipment, type Expense, type Lease, type MoveOut, type Note,
  type Payment, type RentTerm, type Room, type Schedule, type Tenant,
} from '../db'

/**
 * 見本データ（架空の10部屋）
 *
 * 入居者を登録する画面ができたので、**入れるボタンは画面から外した**。
 * 本物の記録が入っている端末で誤って押されたら、全部消えてしまうため。
 * いまも残してあるのは次の3つのため。
 *
 * 1. 試験（`sample.test.ts`）で、現実に近い10部屋ぶんの計算を毎回確かめる
 * 2. すでに見本を入れてしまった端末から、**見本だけを選んで消す**（`removeSample`）
 * 3. 見本モード（`?demo=1`）で、中身の入った画面を見せる。
 *    こちらは**別の置き場**を使うので、本物の記録には触れない（`lib/demo.ts`）
 *
 * 中身は①〜⑥のすべてに行きわたらせてある。どれか1つでも空だと、
 * 見た人がその機能を「まだ無い」と受け取ってしまうため。
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
  { id: 't-102', ...base, name: '渡辺 大樹', kana: 'わたなべ だいき', phone: '090-7777-8888',
    guarantorName: '渡辺 隆（父）', guarantorPhone: '090-7777-1111',
    contactNote: '2026年6月末に退去。大学卒業にともなう転居' },
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
  // 102号室は2026年6月末に退去ずみ。退去の手続きが途中まで進んだ状態を見せるために入れてある
  { ...lease('102', '2022-04-01', '2026-06-30', 108000, 54000), movedOutOn: '2026-06-30' },
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
  term('rt-102', '102', '2022-04', 54000),
  term('rt-103', '103', '2021-10', 62000, '角部屋で日当たりが良いぶん、他より高め'),
  term('rt-104', '104', '2024-03', 58000),
  term('rt-105', '105', '2019-09', 56000),
  term('rt-201', '201', '2023-01', 60000),
  term('rt-202', '202', '2022-06', 57000),
  term('rt-204', '204', '2025-05', 61000, '壁紙を張り替えたぶん、3,000円上げて募集した（58,000→61,000）'),
  term('rt-205', '205', '2020-11', 59000),
]

/**
 * その月に済にする部屋。ここに無い部屋は「未」（行そのものを作らない）。
 *
 * 1月から入れてあるのは、**年ごとのまとめ**を見たときに1年ぶんが埋まるようにするため。
 * 7月までしか無いと「付けはじめる前」の月ばかりになり、集計の画面が見られない。
 */
const ALL = ['101', '102', '103', '104', '105', '201', '202', '204', '205']

const PAID: Record<string, string[]> = {
  '2026-01': ALL,
  '2026-02': ALL,
  '2026-03': ALL,
  '2026-04': ALL,
  '2026-05': ALL,
  '2026-06': ALL, // 102号室はここまで（6月末に退去）
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

/**
 * ③ 修繕・費用
 *
 * 「なぜ、この対応をしたか」が主役の画面なので、見本にも理由を必ず書いておく。
 * 金額だけ並んでいる見本では、この画面の値打ちが伝わらない。
 */
const expenses: Expense[] = [
  { id: 'ex-1', ...base, kind: 'repair', date: '2026-08-03', title: '台所の水漏れ',
    amount: 18000, vendor: '○○水道', roomId: 'r-201', photoIds: [],
    memo: '流しの下の継ぎ手から少しずつ漏れていた。床の板が黒く変わりかけていたので、\n早めに呼んで正解だった。同じ年式の部屋は、次の立会いのときに一緒に見ておく。' },
  { id: 'ex-2', ...base, kind: 'fixed', date: '2026-07-31', title: '貯水槽の清掃',
    amount: 38000, vendor: '××防災', photoIds: [],
    memo: '年に1回。毎年7月末に頼んでいる。' },
  { id: 'ex-3', ...base, kind: 'repair', date: '2026-07-18', title: '給湯器の取り替え',
    amount: 182000, vendor: '△△工業', roomId: 'r-102', photoIds: [],
    memo: '前のものは14年もった。直すこともできたが、部品代と工賃で8万円かかるうえ、\nあと何年もつか分からないと言われたので、空室のうちに新品へ替えた。\n入居中だと湯が止まる日が出るので、この判断でよかったと思う。' },
  { id: 'ex-4', ...base, kind: 'repair', date: '2026-06-28', title: 'クロスの張り替え（102号室）',
    amount: 68000, vendor: '○○内装', roomId: 'r-102', photoIds: [],
    memo: '居室の一面に大きな傷。敷金から引くぶんは、退去の精算に別で入れてある\n（ここに入れた額は、こちらが業者に払った額）。' },
  { id: 'ex-5', ...base, kind: 'fixed', date: '2026-05-20', title: '火災保険（1年分）',
    amount: 48000, vendor: '□□損保', photoIds: [],
    memo: '3年まとめのほうが安いが、建て替えを考える時期なので1年ごとにしている。' },
  { id: 'ex-6', ...base, kind: 'repair', date: '2026-04-05', title: '共用灯をLEDに替えた',
    amount: 32000, vendor: '△△電気', photoIds: [],
    memo: '玄関と階段の6か所。切れるたびに脚立を出していたのが無くなった。\n電気代も月に千円ほど下がっている。' },
  { id: 'ex-7', ...base, kind: 'fixed', date: '2026-02-25', title: '固定資産税（第4期）',
    amount: 41000, photoIds: [] },
]

/**
 * ⑤ 年間の予定
 *
 * 「過ぎているもの・近いもの・まだ先のもの」が1つずつ入るようにしてある。
 * 全部まだ先だと、ホームのお知らせ枠に何も出ず、この機能が見えない。
 */
const schedules: Schedule[] = [
  { id: 'sc-1', ...base, title: '消防設備点検', kind: 'inspection',
    nextDate: '2026-08-08', everyMonths: 6, noticeDays: 60, amount: 33000, vendor: '××防災',
    memo: '半年に1回。前回は2月。報告書は市役所に出す。' },
  { id: 'sc-2', ...base, title: '固定資産税の納付', kind: 'tax',
    nextDate: '2026-08-31', everyMonths: 3, noticeDays: 30, amount: 41000,
    memo: '年4回。納付書は4月にまとめて届く。' },
  { id: 'sc-3', ...base, title: '草刈り・剪定', kind: 'other',
    nextDate: '2026-09-15', everyMonths: 6, noticeDays: 30, amount: 25000, vendor: '緑化サービス',
    memo: '夏と秋の2回。裏の生垣が伸びると隣家に入るので、遅らせない。' },
  { id: 'sc-4', ...base, title: '火災保険の更新', kind: 'insurance',
    nextDate: '2027-05-20', everyMonths: 12, noticeDays: 60, amount: 48000, vendor: '□□損保',
    memo: '落とすとその1年は無保険になる。早めに知らせる。' },
  { id: 'sc-5', ...base, title: '貯水槽の清掃', kind: 'inspection',
    nextDate: '2027-07-31', everyMonths: 12, noticeDays: 30, amount: 38000, vendor: '××防災' },
]

/**
 * ⑥ 設備の年式
 *
 * 替え時を過ぎたもの（赤）・近いもの（黄）・まだ先のものを混ぜてある。
 * 取り替えずみの1行も入れて、「前のは何年もったか」の履歴が見えるようにする。
 */
const equipment: Equipment[] = [
  { id: 'eq-1', ...base, kind: 'waterHeater', roomId: 'r-101', installedOn: '2012-05',
    lifeYears: 12, maker: '△△工業', model: 'GT-1650',
    memo: '入居が長い部屋。止まる前に、次の空室を待たずに替えるか考えておく。' },
  { id: 'eq-2', ...base, kind: 'aircon', roomId: 'r-203', installedOn: '2011-07',
    lifeYears: 13, maker: '◇◇電機',
    memo: '空室のうちに替える。この年式だと修理の部品がもう無い。' },
  { id: 'eq-3', ...base, kind: 'waterHeater', roomId: 'r-103', installedOn: '2015-09',
    lifeYears: 12, maker: '△△工業', model: 'GT-2050' },
  // 「その他」を2件そろえてある。呼び名が無いと、一覧ではどちらも
  // 「建物全体 その他」になって見分けがつかない。名前の欄が効く場面を見本でも見せる
  { id: 'eq-4', ...base, kind: 'other', name: '受水槽', installedOn: '2004-04', lifeYears: 22,
    memo: '清掃は毎年している。取り替えとなると大きな工事になるので、早めに見積りを取る。' },
  { id: 'eq-7', ...base, kind: 'other', name: '高架水槽のポンプ', installedOn: '2016-10',
    lifeYears: 15, maker: '□□ポンプ',
    memo: '止まると上の階の水が出なくなる。音が変わったら早めに見てもらう。' },
  { id: 'eq-5', ...base, kind: 'waterHeater', roomId: 'r-102', installedOn: '2026-07',
    lifeYears: 12, maker: '△△工業', model: 'GT-2060',
    memo: '2026年7月に新品へ交換。募集のときは「給湯器新品」と出す。' },
  { id: 'eq-6', ...base, kind: 'aircon', roomId: 'r-204', installedOn: '2025-05',
    lifeYears: 13, maker: '◇◇電機',
    memo: '壁紙の張り替えと一緒に新品にした。' },
  // 取り替えずみ（履歴として残る行）。eq-5 の前に付いていたもの
  { id: 'eq-old-102', ...base, kind: 'waterHeater', roomId: 'r-102', installedOn: '2012-06',
    lifeYears: 12, maker: '△△工業', model: 'GT-1650', replacedOn: '2026-07-18' },
]

/**
 * 退去の立会いと敷金の精算
 *
 * 途中まで進んだ状態にしてある（7つのうち4つ済み）。
 * 全部済んだ状態だと、ホームのお知らせにも出ず、この画面にたどり着けない。
 */
const moveOuts: MoveOut[] = [
  { id: 'mo-102', ...base, leaseId: 'l-102',
    done: ['appointment', 'inspected', 'photos', 'keys'],
    deductions: [
      { id: 'dd-1', title: 'クロスの張り替え（居室の一面）', amount: 40000,
        reason: '家具をぶつけた大きな傷が壁の一面にあり、下地まで凹んでいた。\n'
          + '普通に住んでいてつく傷とは言えないため、張り替えぶんを引く。\n'
          + '写真を撮ってあり、本人にもその場で見てもらって納得を得ている。' },
    ],
    memo: '鍵は3本すべて返却ずみ。電気・ガス・水道の停止はこれから確かめる。' },
]

/**
 * 見本が触る表の一式。
 *
 * 表を足したときは**ここにも足す**。書き忘れると、
 * 入れかえたつもりの表に前の中身が残り、見本と本物が混ざった状態になる。
 */
const TABLES = () => [
  db.rooms, db.tenants, db.leases, db.rentTerms, db.payments, db.paymentLog,
  db.expenses, db.notes, db.schedules, db.equipment, db.moveOuts,
]

/** 本体の表（写真とmetaを除く）をまとめて入れかえる */
export async function loadSample(): Promise<void> {
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((t) => t.clear()))
    await db.rooms.bulkPut(rooms)
    await db.tenants.bulkPut(tenants)
    await db.leases.bulkPut(leases)
    await db.rentTerms.bulkPut(rentTerms)
    await db.payments.bulkPut(buildPayments())
    await db.notes.bulkPut(notes)
    await db.expenses.bulkPut(expenses)
    await db.schedules.bulkPut(schedules)
    await db.equipment.bulkPut(equipment)
    await db.moveOuts.bulkPut(moveOuts)
  })
}

/** 本体の表を空にする（meta は残す）。試験でだけ使う */
export async function clearSample(): Promise<void> {
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((t) => t.clear()))
  })
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
  await db.transaction('rw', TABLES(), async () => {
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
    await db.expenses.bulkDelete(expenses.map((e) => e.id))
    await db.schedules.bulkDelete(schedules.map((s) => s.id))
    await db.equipment.bulkDelete(equipment.map((e) => e.id))
    await db.moveOuts.bulkDelete(moveOuts.map((m) => m.id))
  })
}

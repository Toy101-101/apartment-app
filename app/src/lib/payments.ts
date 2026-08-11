import { db, newId, now, type Payment } from '../db'
import { today } from './date'

/**
 * 入金の「済／未」を切りかえる
 *
 * 守ること
 * - 押しまちがえは必ず取り消せる。だから、変える前の姿を丸ごと控えておく
 * - 誰が・いつ・何を・どう変えたかを paymentLog に必ず残す。
 *   金額そのものより、「なぜそうしたか」を後から追えることのほうが大事
 */

/** 記録した人。いまは1台で使う前提なので固定。あとで設定にする */
export const DEFAULT_WHO = 'この端末'

/** 取り消しに必要なもの一式 */
export interface ToggleResult {
  /** 変える前の姿。無ければ「その月の行がまだ無かった」ということ */
  before?: Payment
  after: Payment
  /** 画面に出す文（「101号室を『済』にしました」） */
  message: string
}

function stamp(row: Payment, at: string): Payment {
  return { ...row, updatedAt: at }
}

/**
 * 済 ⇄ 未 を1回押すごとに入れかえる。
 * その月の行がまだ無ければ、ここで作る（未の月に行を作り置きしない）。
 */
export async function togglePaid(args: {
  leaseId: string
  month: string
  /** その月にいただく額 */
  due: number
  /** 画面に出す文のためだけに使う */
  roomNo: string
  who?: string
  /** 入金日。ふつうは今日 */
  paidOn?: string
}): Promise<ToggleResult> {
  const { leaseId, month, due, roomNo, who = DEFAULT_WHO, paidOn = today() } = args
  const at = now()

  const before = await db.payments.where('[leaseId+month]').equals([leaseId, month]).first()

  let after: Payment
  if (before?.paidOn) {
    // 済 → 未。金額やメモは消さずに残し、入金日だけを取り去る
    after = stamp(before, at)
    delete after.paidOn
  } else if (before) {
    // 未 → 済（行はすでにある）
    after = { ...stamp(before, at), paidOn, amount: before.amount || due }
  } else {
    // 未 → 済（その月の行をここで作る）
    after = {
      id: newId(), createdAt: at, updatedAt: at,
      leaseId, month, amount: due, paidOn, method: 'transfer',
    }
  }

  await db.transaction('rw', db.payments, db.paymentLog, async () => {
    await db.payments.put(after)
    await db.paymentLog.add({
      id: newId(), createdAt: at, updatedAt: at,
      paymentId: after.id, at, who,
      action: after.paidOn ? 'markPaid' : 'markUnpaid',
      before: before ? JSON.stringify(before) : undefined,
      after: JSON.stringify(after),
    })
  })

  return {
    before,
    after,
    message: `${roomNo}号室を「${after.paidOn ? '済' : '未'}」にしました`,
  }
}

/** 直前の切りかえを取り消して、元の姿に戻す */
export async function undoToggle(result: ToggleResult, who: string = DEFAULT_WHO): Promise<void> {
  const at = now()
  await db.transaction('rw', db.payments, db.paymentLog, async () => {
    if (result.before) {
      await db.payments.put(result.before)
    } else {
      // 押す前は行そのものが無かったので、作った行を消す
      await db.payments.delete(result.after.id)
    }
    await db.paymentLog.add({
      id: newId(), createdAt: at, updatedAt: at,
      paymentId: result.after.id, at, who, action: 'undo',
      before: JSON.stringify(result.after),
      after: result.before ? JSON.stringify(result.before) : undefined,
    })
  })
}

/** その月に触った記録を新しい順に返す（画面の「最近の操作」用） */
export async function recentLog(limit = 5) {
  return db.paymentLog.orderBy('at').reverse().limit(limit).toArray()
}

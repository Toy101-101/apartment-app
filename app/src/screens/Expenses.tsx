import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatDate, yen } from '../lib/date'
import { buildExpenseRows, KIND_LABEL, totalOf, type KindFilter } from '../lib/expenses'
import s from './Expenses.module.css'

/**
 * ③ 修繕・費用 の一覧
 *
 * 新しい順。金額よりも「何をしたか」と「なぜそうしたか」が先に目に入るように並べる。
 */

const TABS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'repair', label: '修繕' },
  { key: 'fixed', label: '固定費' },
]

export default function Expenses() {
  const [kind, setKind] = useState<KindFilter>('all')

  const rows = useLiveQuery(async () => {
    const [expenses, rooms] = await Promise.all([db.expenses.toArray(), db.rooms.toArray()])
    return buildExpenseRows({ expenses, rooms, kind })
  }, [kind])

  return (
    <Screen title="③ 修繕・費用">
      <div className={s.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            aria-pressed={kind === tab.key}
            onClick={() => setKind(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Link className={s.add} to="/expenses/new">
        ＋ 新しく記録する
      </Link>

      {rows === undefined && <p className={s.note}>読み込んでいます…</p>}

      {rows?.length === 0 && (
        <p className={s.note}>
          {kind === 'all'
            ? 'まだ1件も記録がありません。修繕をしたときや、保険・税金を払ったときに残していってください。'
            : 'この種類の記録はまだありません。'}
        </p>
      )}

      {rows?.map(({ expense, target, preview }) => (
        <Link key={expense.id} className={s.card} to={`/expenses/${expense.id}`}>
          <div className={s.title}>{expense.title}</div>
          <div className={s.meta}>
            <span className="num">{formatDate(expense.date)}</span>
            <span>{target}</span>
            <span className={expense.kind === 'repair' ? s.repair : s.fixed}>
              {KIND_LABEL[expense.kind]}
            </span>
          </div>
          <div className={`${s.amount} num`}>{yen(expense.amount)}</div>
          {preview && <div className={s.preview}>📝 {preview}</div>}
          {expense.photoIds.length > 0 && (
            <div className={s.photos}>📷 写真 {expense.photoIds.length}枚</div>
          )}
        </Link>
      ))}

      {rows && rows.length > 0 && (
        <section className={s.summary}>
          この一覧の合計：<b className="num">{yen(totalOf(rows))}</b>
        </section>
      )}
    </Screen>
  )
}

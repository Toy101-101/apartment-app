import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { ageText, ageInMonths, buildEquipmentRows, labelOf, replacedHistory } from '../lib/equipment'
import { formatDate } from '../lib/date'
import s from './Equipment.module.css'

/**
 * ⑥ 設備の年式（給湯器・エアコンなど）
 *
 * 壊れてから慌てて手配すると、真冬や真夏に入居者を待たせたうえ、
 * 緊急の工事になって高くつく。設置した年を残しておけば「そろそろ替え時」が先に分かり、
 * 部屋が空いているあいだに落ち着いて替えられる。
 *
 * 一覧は**古い順**。いちばん上が、いちばん替え時が近い。
 */
export default function Equipment() {
  const view = useLiveQuery(async () => {
    const [equipment, rooms] = await Promise.all([db.equipment.toArray(), db.rooms.toArray()])
    const roomById = new Map(rooms.map((r) => [r.id, r]))
    return {
      rows: buildEquipmentRows({ equipment, rooms }),
      history: replacedHistory(equipment).map((e) => ({
        equipment: e,
        target: e.roomId ? `${roomById.get(e.roomId)?.roomNo ?? '?'}号室` : '建物全体',
        lasted: ageText(ageInMonths(e.installedOn, e.replacedOn ?? e.installedOn)),
      })),
    }
  }, [])

  return (
    <Screen title="⑥ 設備の年式">
      <Link className={s.add} to="/equipment/new">
        ＋ 設備を足す
      </Link>

      {view === undefined && <p className={s.note}>読み込んでいます…</p>}

      {view?.rows.length === 0 && view.history.length === 0 && (
        <p className={s.note}>
          まだ1件も登録がありません。
          給湯器やエアコンを、置いてある部屋と設置した年で入れておくと、
          替え時が近づいたときに分かります。
          壊れてから手配すると、真冬や真夏に入居者を待たせることになります。
        </p>
      )}

      {view?.rows.map((row) => {
        const { equipment: e } = row
        return (
          <section
            key={e.id}
            className={`${s.card} ${row.level === 'red' ? s.red : row.level === 'yellow' ? s.yellow : ''}`}
          >
            <div className={s.head}>
              <h2 className={s.title}>
                {row.target} {row.label}
              </h2>
              <span className={s.age}>{row.ageText}</span>
            </div>

            <p className={row.level === 'none' ? s.life : s.lifeWarn}>{row.lifeText}</p>

            <p className={s.meta}>
              {e.installedOn.replace('-', '年')}月に設置 ・ 目安 {e.lifeYears}年
              {e.maker ? ` ・ ${e.maker}` : ''}
              {e.model ? ` ${e.model}` : ''}
            </p>
            {e.memo && <p className={s.memo}>{e.memo}</p>}

            <div className={s.actions}>
              <Link className={s.primary} to={`/equipment/${e.id}/replace`}>
                取り替えた
              </Link>
              <Link className={s.secondary} to={`/equipment/${e.id}/edit`}>
                直す
              </Link>
            </div>
          </section>
        )
      })}

      {/* 「前のは13年もった」が、次に替えるときの判断材料になる */}
      {view && view.history.length > 0 && (
        <section className={s.history}>
          <h2 className={s.historyTitle}>取り替えたもの</h2>
          <ul>
            {view.history.map(({ equipment: e, target, lasted }) => (
              <li key={e.id}>
                <b>
                  {target} {labelOf(e)}
                </b>
                <span className={s.historyMeta}>
                  {formatDate(e.replacedOn ?? '')}に取り替え ・ {lasted}もった
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}

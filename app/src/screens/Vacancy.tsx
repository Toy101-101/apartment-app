import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { formatShort } from '../lib/date'
import { buildVacancyRows, countStates, STATE_LABEL, type VacancyRow } from '../lib/vacancy'
import s from './Vacancy.module.css'

/**
 * ④ 空室の状況
 *
 * この画面は入力を持たない。契約データを見て、そのつど組み立てているだけ。
 * だから「契約は退去になっているのに、空室一覧では入居中のまま」ということが起きない。
 */
export default function Vacancy() {
  const rows = useLiveQuery(async () => {
    const [rooms, leases, tenants] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
    ])
    return buildVacancyRows({ rooms, leases, tenants })
  }, [])

  const count = rows ? countStates(rows) : null

  return (
    <Screen title="④ 空室の状況">
      {rows === undefined && <p className={s.note}>読み込んでいます…</p>}

      {rows?.length === 0 && (
        <p className={s.note}>
          まだ部屋が登録されていません。
          「① 入居者・契約」から契約を登録すると、ここに部屋が並びます。
        </p>
      )}

      {count && rows && rows.length > 0 && (
        <section className={s.summary}>
          <div>
            <b className={`${s.occupied} num`}>{count.occupied}</b>
            <span>入居中</span>
          </div>
          <div>
            <b className={`${s.vacant} num`}>{count.vacant}</b>
            <span>空室</span>
          </div>
          <div>
            <b className={`${s.leaving} num`}>{count.leaving}</b>
            <span>退去予定</span>
          </div>
        </section>
      )}

      <div className={s.tiles}>
        {rows?.map((row) => (
          <Tile key={row.room.id} row={row} />
        ))}
      </div>

      {rows && rows.length > 0 && (
        <p className={s.lead}>
          部屋を押すと、その部屋の契約が見られます。
          空室の部屋は、前に住んでいた方の記録がひらきます。
        </p>
      )}
    </Screen>
  )
}

/** タイル1枚。押せる先があるときだけリンクにする */
function Tile({ row }: { row: VacancyRow }) {
  const to = row.lease
    ? `/contracts/${row.lease.id}`
    : row.previousLease
      ? `/contracts/${row.previousLease.id}`
      : undefined

  const body = (
    <>
      <span className={`${s.no} num`}>{row.room.roomNo}</span>
      <span className={s.state}>{STATE_LABEL[row.state]}</span>
      <span className={s.sub}>{subtitleOf(row)}</span>
    </>
  )

  const className = `${s.tile} ${s[row.state]}`
  return to ? (
    <Link className={className} to={to}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** タイルの3行目。状態ごとに、いちばん知りたいことを1つだけ出す */
function subtitleOf(row: VacancyRow): string {
  if (row.state === 'occupied') return row.tenant?.name ?? ''
  if (row.state === 'leaving') {
    return row.leavingOn ? `${formatShort(row.leavingOn)}まで` : ''
  }
  if (row.nextFrom) return `${formatShort(row.nextFrom)}から入居`
  return row.vacantSince ? `${formatShort(row.vacantSince)}から空室` : '記録がありません'
}

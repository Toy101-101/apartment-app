import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { db } from '../db'
import { buildContractRows, renewalText, type ContractRow } from '../lib/contracts'
import { formatDate, yen } from '../lib/date'
import s from './Contracts.module.css'

/**
 * ① 入居者・契約 の一覧
 *
 * 並びは「更新が近い順」。終わった契約は下にまわすが、消しはしない
 * （誰がいつ住んでいたかは、引き継ぎで最初に失われる情報のため）。
 */

export default function Contracts() {
  const rows = useLiveQuery(async () => {
    const [leases, rooms, tenants, rentTerms] = await Promise.all([
      db.leases.toArray(),
      db.rooms.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
    ])
    return buildContractRows({ leases, rooms, tenants, rentTerms })
  }, [])

  const living = rows?.filter((r) => r.living) ?? []
  const ended = rows?.filter((r) => !r.living) ?? []

  return (
    <Screen title="① 入居者・契約">
      <Link className={s.add} to="/contracts/new">
        ＋ 新しい契約を登録する
      </Link>

      {rows === undefined && <p className={s.note}>読み込んでいます…</p>}

      {rows?.length === 0 && (
        <p className={s.note}>
          まだ1件も登録されていません。
          上の「新しい契約を登録する」から、部屋ごとに入れていってください。
        </p>
      )}

      {living.length > 0 && <h2 className={s.groupTitle}>いま住んでいる方</h2>}
      {living.map((row) => (
        <ContractCard key={row.lease.id} row={row} />
      ))}

      {ended.length > 0 && (
        <>
          <h2 className={s.groupTitle}>終わった契約</h2>
          <p className={s.groupNote}>
            退去された方の記録も残してあります。過去の家賃や、そのときの経緯を読めます。
          </p>
          {ended.map((row) => (
            <ContractCard key={row.lease.id} row={row} />
          ))}
        </>
      )}
    </Screen>
  )
}

function ContractCard({ row }: { row: ContractRow }) {
  const tone = !row.living ? s.ended : row.future ? s.future : s[row.level]
  return (
    <Link className={`${s.card} ${tone}`} to={`/contracts/${row.lease.id}`}>
      <div className={s.head}>
        <span className={`${s.roomNo} num`}>{row.room?.roomNo ?? '—'}</span>
        <span className={s.name}>{row.tenant?.name ?? '（名前なし）'}</span>
      </div>
      <div className={`${s.rent} num`}>{yen(row.rent)}／月</div>
      <div className={s.renewal}>{renewalText(row)}</div>
      <div className={s.period}>
        {formatDate(row.lease.movedOutOn ?? row.lease.endDate)}まで
      </div>
    </Link>
  )
}

import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatDate, today, yen } from '../lib/date'
import { buildContractRows } from '../lib/contracts'
import { buildVacancyRows, STATE_LABEL } from '../lib/vacancy'
import s from './Print.module.css'

/**
 * 読める1枚（印刷用）
 *
 * この画面だけは、画面で読むためではなく**紙に出すため**に作ってある。
 * 停電でもスマホが壊れていても読める形が1つあること自体が、引き継ぎの備えになる。
 *
 * 紙は指で押さないので、ここだけは17px・64pxの決まりを当てない。
 * 代わりに、A4の1枚に収まる大きさを優先する。
 */
export default function Print() {
  const data = useLiveQuery(async () => {
    const [rooms, leases, tenants, rentTerms] = await Promise.all([
      db.rooms.toArray(),
      db.leases.toArray(),
      db.tenants.toArray(),
      db.rentTerms.toArray(),
    ])
    const contracts = buildContractRows({ leases, rooms, tenants, rentTerms })
    const vacancy = buildVacancyRows({ rooms, leases, tenants })

    // 部屋の順に並べ、その部屋のいまの契約をあてる
    return vacancy.map((v) => ({
      ...v,
      contract: contracts.find((c) => c.lease.id === v.lease?.id),
    }))
  }, [])

  const rent = data
    ?.filter((r) => r.state !== 'vacant')
    .reduce((sum, r) => sum + (r.contract?.rent ?? 0), 0)

  return (
    <div className={s.page}>
      {/* 印刷には出さない操作の帯 */}
      <div className={s.bar}>
        <Link to="/backup">‹ もどる</Link>
        <button onClick={() => window.print()}>この紙を印刷する</button>
      </div>

      <header className={s.head}>
        <h1>入居者一覧</h1>
        <p>{formatDate(today())} 現在</p>
      </header>

      {data === undefined && <p>読み込んでいます…</p>}

      {data && (
        <>
          <table className={s.table}>
            <thead>
              <tr>
                <th>部屋</th>
                <th>入居者（ふりがな）</th>
                <th>電話</th>
                {/* 表に出しているのは管理費を足したあとの額。紙だけを見る人が読み違えないよう見出しに書く */}
                <th className={s.right}>
                  家賃<span className={s.sub}>（管理費込み）</span>
                </th>
                <th>契約</th>
                <th>保証人</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.room.id}>
                  <td className={s.no}>
                    {row.room.roomNo}
                    {row.state !== 'occupied' && (
                      <span className={s.state}>{STATE_LABEL[row.state]}</span>
                    )}
                  </td>
                  <td>
                    {row.tenant ? (
                      <>
                        {row.tenant.name}
                        <span className={s.kana}>（{row.tenant.kana}）</span>
                      </>
                    ) : (
                      <span className={s.empty}>
                        {row.vacantSince ? `${formatDate(row.vacantSince)}から空室` : '—'}
                      </span>
                    )}
                  </td>
                  <td>{row.tenant?.phone ?? ''}</td>
                  <td className={s.right}>{row.contract ? yen(row.contract.rent) : ''}</td>
                  <td>
                    {row.lease
                      ? `${row.lease.startDate.replace(/-/g, '/')}〜${(row.lease.movedOutOn ?? row.lease.endDate).replace(/-/g, '/')}`
                      : ''}
                  </td>
                  <td>
                    {row.tenant?.guarantorName ?? ''}
                    {row.tenant?.guarantorPhone && (
                      <span className={s.kana}> {row.tenant.guarantorPhone}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>入居中・退去予定の合計</td>
                <td className={s.right}>{yen(rent ?? 0)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>

          {/* 契約書のどこにも書かれない情報。ここに出すことが引き継ぎの要 */}
          {data.some((r) => r.tenant?.contactNote) && (
            <section className={s.notes}>
              <h2>連絡のしかた（契約書には書かれていないこと）</h2>
              <dl>
                {data
                  .filter((r) => r.tenant?.contactNote)
                  .map((r) => (
                    <div key={r.room.id}>
                      <dt>
                        {r.room.roomNo} {r.tenant?.name}
                      </dt>
                      <dd>{r.tenant?.contactNote}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          <footer className={s.foot}>
            この紙は「アパート管理」から印刷したものです。
            くわしい経緯（家賃を変えた理由、修繕のいきさつ）は、アプリの中に残っています。
          </footer>
        </>
      )}
    </div>
  )
}

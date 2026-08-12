import { StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import './styles/tokens.css'
import { DemoBanner } from './components/DemoBanner'
import { IS_DEMO } from './lib/demo'
import { hasSampleData, loadSample } from './lib/sample'
import Activity from './screens/Activity'
import Backup from './screens/Backup'
import ContractDetail from './screens/ContractDetail'
import ContractForm from './screens/ContractForm'
import Contracts from './screens/Contracts'
import Equipment from './screens/Equipment'
import EquipmentForm from './screens/EquipmentForm'
import ExpenseDetail from './screens/ExpenseDetail'
import ExpenseForm from './screens/ExpenseForm'
import Expenses from './screens/Expenses'
import Home from './screens/Home'
import MoveOut from './screens/MoveOut'
import Payments from './screens/Payments'
import Print from './screens/Print'
import ScheduleForm from './screens/ScheduleForm'
import Schedules from './screens/Schedules'
import Settings from './screens/Settings'
import Trash from './screens/Trash'
import Vacancy from './screens/Vacancy'
import Yearly from './screens/Yearly'

/**
 * 画面を移ったら、必ずいちばん上から見せる。
 *
 * 画面が切りかわっても、スクロールの位置はそのまま残る。
 * ホームの下のほうにある入口（⑤年間の予定・⑥設備の年式・年ごとのまとめ・控え）を
 * 押すと、次の画面が**途中から**開いてしまい、上に何があるのか分からなくなる。
 *
 * `useLayoutEffect` を使うのは、絵を描く前に位置を戻すため。
 * `useEffect` だと、一瞬だけ途中の位置が見えてしまう。
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// もどるときにブラウザが勝手に位置を戻すと、上の処理と取り合いになる。
// どの画面もいちばん上から始まる、という1つの決まりにそろえる
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

/**
 * 見本モードのときは、画面を出す前に架空の10部屋を入れておく。
 *
 * 入れるのは**空のときだけ**。毎回入れ直すと、見て回っている途中で
 * 画面を開き直しただけで操作が消え、確かめようが無くなる。
 * 最初にもどしたいときは、帯の中のボタンから。
 *
 * ここで使う置き場は `apartment-demo`（`lib/demo.ts`）。本物とは別なので、
 * 中身を消してから入れるこの処理が、本物の記録に届くことはない。
 */
async function prepare() {
  if (!IS_DEMO) return
  try {
    if (!(await hasSampleData())) await loadSample()
  } catch (e) {
    // 見本を入れられなくても、画面自体は出す（空の画面のほうが、真っ白よりましなため）。
    // ただし黙って空にすると「壊れている」と読まれるので、手がかりだけは残す
    console.warn('見本データを入れられませんでした', e)
  }
}

// GitHub Pages では直接URLを開くと404になるため、
// 通常の BrowserRouter ではなく HashRouter を使う（URLに # が入る）
void prepare().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ScrollToTop />
      {IS_DEMO && <DemoBanner />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/contracts" element={<Contracts />} />
        {/* 「新しい契約」は :id より先に置く（先に書いたほうが優先されるため） */}
        <Route path="/contracts/new" element={<ContractForm />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        <Route path="/contracts/:id/edit" element={<ContractForm />} />
        <Route path="/contracts/:id/moveout" element={<MoveOut />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/expenses/new" element={<ExpenseForm />} />
        <Route path="/expenses/:id" element={<ExpenseDetail />} />
        <Route path="/expenses/:id/edit" element={<ExpenseForm />} />
        <Route path="/vacancy" element={<Vacancy />} />
        {/* 「新しい予定」は :id より先に置く（先に書いたほうが優先されるため） */}
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/schedules/new" element={<ScheduleForm />} />
        <Route path="/schedules/:id/edit" element={<ScheduleForm />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/equipment/new" element={<EquipmentForm />} />
        <Route path="/equipment/:id/edit" element={<EquipmentForm />} />
        <Route path="/equipment/:id/replace" element={<EquipmentForm />} />
        <Route path="/yearly" element={<Yearly />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/print" element={<Print />} />
        {/* 知らないURLはホームに落とす（控えのリンクなどを踏んでも迷子にならない） */}
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
))

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './styles/tokens.css'
import ContractDetail from './screens/ContractDetail'
import ContractForm from './screens/ContractForm'
import Contracts from './screens/Contracts'
import Home from './screens/Home'
import Payments from './screens/Payments'

// GitHub Pages では直接URLを開くと404になるため、
// 通常の BrowserRouter ではなく HashRouter を使う（URLに # が入る）
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/contracts" element={<Contracts />} />
        {/* 「新しい契約」は :id より先に置く（先に書いたほうが優先されるため） */}
        <Route path="/contracts/new" element={<ContractForm />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        <Route path="/contracts/:id/edit" element={<ContractForm />} />
        {/* 知らないURLはホームに落とす（控えのリンクなどを踏んでも迷子にならない） */}
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)

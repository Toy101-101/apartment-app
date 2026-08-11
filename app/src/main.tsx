import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './styles/tokens.css'
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
        {/* 知らないURLはホームに落とす（控えのリンクなどを踏んでも迷子にならない） */}
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)

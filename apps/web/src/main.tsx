import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BacktestPage } from './BacktestPage.tsx'

const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
const page = pathname === '/backtest' ? <BacktestPage /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
)

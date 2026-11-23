import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { mirrorBills } from './billReminders'
import { initPwa } from './pwa'
import { initTheme } from './settings'

initTheme()
initPwa()
mirrorBills()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

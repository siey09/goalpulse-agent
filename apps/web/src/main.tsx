import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hideBootSplash } from './lib/bootSplash'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Safety net only. The real trigger is App calling hideBootSplash() once
// its first dashboard load attempt settles (apps/web/src/App.tsx,
// loadDashboard). Render's free tier can cold-start slowly, so this is a
// generous ceiling - it exists so the splash can never get stuck forever,
// not to define normal timing.
window.setTimeout(hideBootSplash, 10000)

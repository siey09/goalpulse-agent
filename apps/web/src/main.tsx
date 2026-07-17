import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The static #boot-splash in index.html covers the gap between "browser
// requested the page" and "React has actually painted something" - a real
// gap on a hard refresh, not just lazy-route loading (that's LoadingScreen's
// job). Fade it out once the app has painted, rather than on a fixed timer.
const bootSplash = document.getElementById('boot-splash')
if (bootSplash) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bootSplash.classList.add('boot-splash-hide')
      window.setTimeout(() => bootSplash.remove(), 400)
    })
  })
}

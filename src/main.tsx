import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './family/fonts.css'
import './family/tokens.css'
import './family/switcher.js'
import './index.css'
import { followLaunchLinks, registerServiceWorker } from './pwa/register'
import { greetQuaeraOpener } from './core/quaeraLink'
import { App } from './ui/App'
import { initEngine } from './ui/store'

void initEngine()
// is the window that opened Lab the trainer? then "Count it in Quaera" returns to it (core/quaeraLink.ts)
greetQuaeraOpener()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
followLaunchLinks()

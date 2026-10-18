import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './family/fonts.css'
import './family/tokens.css'
import './family/switcher.js'
import './index.css'
import { registerServiceWorker } from './pwa/register'
import { App } from './ui/App'
import { initEngine } from './ui/store'

void initEngine()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()

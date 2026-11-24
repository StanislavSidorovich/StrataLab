import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/vote.css'
import { VotePage } from './ui/VotePage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VotePage />
  </StrictMode>,
)

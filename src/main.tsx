// Two entrances. A phone that scanned the lesson's QR code (`#vote=K7M2P`) gets only the small vote page: no DuckDB, no datasets, no
// Python, no App. Everything else is the workbench (boot.tsx). The choice is made before either is imported.
import './family/fonts.css'
import './family/tokens.css'
import { isVoteHash } from './core/voting'

if (isVoteHash(location.hash)) void import('./voteBoot')
else void import('./boot')

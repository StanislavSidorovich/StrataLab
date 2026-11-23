// Vote sets by section id (`#lesson=sql&set=<id>&mode=vote`). A section with no entry here has no vote yet.
import type { VoteQuestion } from '../../core/lesson'
import { INNER_JOIN_VOTES } from './innerJoin'

export const VOTES: Record<string, VoteQuestion[]> = { 'inner-join': INNER_JOIN_VOTES }

// Vote sets by section id (`#lesson=sql&set=<id>&mode=vote`). A section with no entry here has no vote yet.
// The warm-up questions are a set of their own (`set=warmup`, see WARMUP_SET in core/lesson.ts).
import type { VoteQuestion } from '../../core/lesson'
import { INNER_JOIN_VOTES } from './innerJoin'

export { WARMUP } from './warmup'
export const VOTES: Record<string, VoteQuestion[]> = { 'inner-join': INNER_JOIN_VOTES }

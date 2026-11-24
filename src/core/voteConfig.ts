// Where phone voting keeps its votes: the trainer's Supabase project (quaera.app), used only as a store with SQL functions
// (supabase/0001_lesson_voting.sql); Lab has no server of its own and ships no supabase-js, only fetch (voteApi.ts).
// Both values are public by design (the same pair is in quaera/src/sync/client.ts): the key is not a secret, the protection is
// that the tables have row level security with no policies and every function checks what it is given.
export const SUPABASE_URL = 'https://lueignziprnjnjiixdsh.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Bjyj9gNlpgFJXhbWb7vhIg_DlpXtQpx'

-- Quaera Lab: phone voting, part 3. Fill-the-gaps questions (plan items `f1`, `f2`, ...): a phone sends 1 to 3 short answers instead of a letter.
--
-- WHAT IT IS: one table and two functions next to the ones of 0001. Same rules as there: the table is closed (row level security on, no
-- policies, no grants), nobody reads or writes a row directly, only the functions do, and they check every argument. Needs
-- 0001_lesson_voting.sql to have been run first (it uses `lesson_rooms`).
--   lesson_cast_fill(code, q_key, token, answers)  a phone sends its answers: 'ok' | 'closed' | 'unknown' | 'room_full' | 'too_many_changes' | 'invalid'.
--                                                  One row per (room, question, token): a second tap or a changed mind updates it.
--   lesson_fill_read(code, secret, q_key)          the TEACHER reads counts, only with the room's secret: [{q_key, answers, sample, n}], one row
--                                                  per distinct set of answers (answers: lower case, spaces collapsed; sample: as one phone typed
--                                                  it; n: how many phones). No tokens. q_key null gives every question of the room.
-- A phone never sees anyone else's answers: it has no secret.
--
-- Caps: each answer 1 to 30 characters (after trimming), 1 to 3 answers, 300 different phones per room (counted over votes and fill
-- answers together), 20 changes of one phone's answers per question; the room lives 24 h, as in 0001.
--
-- HOW TO RUN: once, in the Supabase dashboard -> SQL editor -> paste the whole file -> Run. SAFE TO RE-RUN: `create ... if not exists`,
-- `create or replace function`, grants repeated; re-running changes no data. It does not touch any other table of the project.
-- Until it is run, the projector says "Run supabase/0003 to collect fill answers" on a fill question, and phones say they cannot send yet.

create table if not exists public.lesson_fill_answers (
  room       text not null references public.lesson_rooms (code) on delete cascade,
  q_key      text not null check (char_length(q_key) between 1 and 40),
  token      uuid not null,
  answers    text[] not null check (cardinality(answers) between 1 and 3),
  changes    int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room, q_key, token)
);

alter table public.lesson_fill_answers enable row level security;
-- no policies on purpose: with RLS on and no policy, a role without BYPASSRLS sees and changes nothing
revoke all on public.lesson_fill_answers from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- functions

create or replace function public.lesson_cast_fill(p_code text, p_q_key text, p_token uuid, p_answers text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.lesson_rooms%rowtype;
  v_clean text[];
  v_old   public.lesson_fill_answers%rowtype;
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' or p_token is null
     or p_q_key is null or char_length(p_q_key) not between 1 and 40 or p_q_key !~ '^[A-Za-z0-9:_-]+$'
     or p_answers is null or cardinality(p_answers) not between 1 and 3 then
    return 'invalid';
  end if;
  -- trimmed, runs of white space collapsed to one space; every answer 1 to 30 characters
  select array_agg(btrim(regexp_replace(a, '\s+', ' ', 'g')) order by ord) into v_clean from unnest(p_answers) with ordinality as t(a, ord);
  if exists (select 1 from unnest(v_clean) as c where c is null or char_length(c) not between 1 and 30) then
    return 'invalid';
  end if;

  select * into v_room from public.lesson_rooms where code = p_code and created_at > now() - interval '24 hours';
  if not found then return 'unknown'; end if;
  if v_room.q_key is distinct from p_q_key or not v_room.q_open then return 'closed'; end if;

  select * into v_old from public.lesson_fill_answers where room = p_code and q_key = p_q_key and token = p_token;
  if found then
    if v_old.answers = v_clean then return 'ok'; end if; -- the same again (a double tap): nothing changes, nothing is counted
    if v_old.changes >= 20 then return 'too_many_changes'; end if;
    update public.lesson_fill_answers set answers = v_clean, changes = changes + 1, updated_at = now()
      where room = p_code and q_key = p_q_key and token = p_token;
    return 'ok';
  end if;

  -- 300 different phones per room, over votes and fill answers together
  if not exists (select 1 from public.lesson_votes where room = p_code and token = p_token)
     and not exists (select 1 from public.lesson_fill_answers where room = p_code and token = p_token)
     and (select count(*) from (
            select token from public.lesson_votes where room = p_code
            union
            select token from public.lesson_fill_answers where room = p_code
          ) as t) >= 300 then
    return 'room_full';
  end if;
  insert into public.lesson_fill_answers (room, q_key, token, answers) values (p_code, p_q_key, p_token, v_clean)
    on conflict (room, q_key, token) do update set answers = excluded.answers, updated_at = now(); -- two taps at once
  return 'ok';
end;
$$;

create or replace function public.lesson_fill_read(p_code text, p_secret uuid, p_q_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' or p_secret is null then return null; end if;
  if p_q_key is not null and char_length(p_q_key) not between 1 and 40 then return null; end if;
  perform 1 from public.lesson_rooms where code = p_code and secret = p_secret and created_at > now() - interval '24 hours';
  if not found then return null; end if; -- a wrong secret looks like a wrong code
  return coalesce((
    select jsonb_agg(jsonb_build_object('q_key', y.q_key, 'answers', y.norm, 'sample', y.sample, 'n', y.n) order by y.q_key, y.n desc, y.norm::text)
      from (
        select x.q_key, x.norm, (array_agg(to_jsonb(x.answers) order by x.updated_at))[1] as sample, count(*) as n
          from (
            select f.q_key, f.answers, f.updated_at,
                   array(select btrim(regexp_replace(lower(regexp_replace(btrim(a), '\s+', ' ', 'g')), '[;\s]+$', ''))
                           from unnest(f.answers) with ordinality as t(a, ord) order by ord) as norm
              from public.lesson_fill_answers f
             where f.room = p_code and (p_q_key is null or f.q_key = p_q_key)
          ) x
         group by x.q_key, x.norm
      ) y
  ), '[]'::jsonb);
end;
$$;

-- Only these two functions are reachable, and only by these roles; the table stays closed.
revoke all on function public.lesson_cast_fill(text, text, uuid, text[]) from public;
revoke all on function public.lesson_fill_read(text, uuid, text) from public;
grant execute on function public.lesson_cast_fill(text, text, uuid, text[]) to anon, authenticated;
grant execute on function public.lesson_fill_read(text, uuid, text) to anon, authenticated;

-- Ask PostgREST to pick the new functions up at once.
notify pgrst, 'reload schema';

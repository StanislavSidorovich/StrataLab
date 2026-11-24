-- Quaera Lab: phone voting for lesson mode (hidden teacher screens, `#lesson=sql…`; phones open `#vote=<code>`).
--
-- WHAT IT IS: three small tables and five functions in the trainer's Supabase project. Lab has no server of its own; this is
-- only a store. The browser calls the functions (`/rest/v1/rpc/<name>`) with the project's publishable key. The tables are
-- closed (row level security on, no policies, no grants): nobody can select or write a row directly, only through the functions,
-- which check every argument. A phone never sees tokens or other people's votes, only counts.
--
-- HOW TO RUN: once, in the Supabase dashboard → SQL editor → paste the whole file → Run.
-- IT IS SAFE TO RE-RUN: `create … if not exists`, `create or replace function`, grants are repeated. Re-running changes no data.
-- It does not touch any other table of the project (all names start with `lesson_`).
--
-- Caps (also in src/core/voting.ts, LIMITS): a room lives 24 h; at most 30 rooms are made per hour for the whole project;
-- 300 different phones per room; 20 changes of one phone's letter per question.

create table if not exists public.lesson_rooms (
  code       text primary key check (code ~ '^[A-Z2-9]{5}$'),
  secret     uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  q_key      text null check (q_key is null or char_length(q_key) between 1 and 40),
  q_label    text null check (q_label is null or char_length(q_label) <= 80),
  q_open     boolean not null default false
);

-- questions the teacher has revealed: they stay closed when the teacher goes back to them
create table if not exists public.lesson_closed (
  room  text not null references public.lesson_rooms (code) on delete cascade,
  q_key text not null check (char_length(q_key) between 1 and 40),
  primary key (room, q_key)
);

-- one row per phone per question: no IP, no name, only a random token the phone made up
create table if not exists public.lesson_votes (
  room       text not null references public.lesson_rooms (code) on delete cascade,
  q_key      text not null check (char_length(q_key) between 1 and 40),
  token      uuid not null,
  letter     char(1) not null check (letter in ('A', 'B', 'C', 'D')),
  changes    int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room, q_key, token)
);

create index if not exists lesson_rooms_created_idx on public.lesson_rooms (created_at);

alter table public.lesson_rooms  enable row level security;
alter table public.lesson_closed enable row level security;
alter table public.lesson_votes  enable row level security;
-- no policies on purpose: with RLS on and no policy, a role without BYPASSRLS sees and changes nothing
revoke all on public.lesson_rooms, public.lesson_closed, public.lesson_votes from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- functions

-- A new room: {code, secret}, or {error: 'busy'} (30 rooms in the last hour) or {error: 'collision'} (five unlucky codes).
create or replace function public.lesson_create_room()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0, O, 1, I, L
  v_code   text;
  v_secret uuid;
  i        int;
  j        int;
begin
  delete from public.lesson_rooms where created_at < now() - interval '24 hours';
  if (select count(*) from public.lesson_rooms where created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'busy');
  end if;
  for i in 1..5 loop
    v_code := '';
    for j in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
    end loop;
    insert into public.lesson_rooms (code) values (v_code)
      on conflict (code) do nothing
      returning secret into v_secret;
    if v_secret is not null then
      return jsonb_build_object('code', v_code, 'secret', v_secret);
    end if;
  end loop;
  return jsonb_build_object('error', 'collision');
end;
$$;

-- The teacher moves the room to a question (q_key null: no question now, e.g. a write-code task). 'ok' | 'unknown' | 'invalid'.
-- A question revealed before stays closed; any other opens.
create or replace function public.lesson_set_question(p_code text, p_secret uuid, p_q_key text, p_q_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' then return 'invalid'; end if;
  if p_q_key is not null and (char_length(p_q_key) not between 1 and 40 or p_q_key !~ '^[A-Za-z0-9:_-]+$') then return 'invalid'; end if;
  if p_q_label is not null and char_length(p_q_label) > 80 then return 'invalid'; end if;
  if p_q_key is null then
    update public.lesson_rooms set q_key = null, q_label = null, q_open = false
      where code = p_code and secret = p_secret and created_at > now() - interval '24 hours';
  else
    update public.lesson_rooms r set
        q_key = p_q_key,
        q_label = p_q_label,
        q_open = not exists (select 1 from public.lesson_closed c where c.room = r.code and c.q_key = p_q_key)
      where r.code = p_code and r.secret = p_secret and r.created_at > now() - interval '24 hours';
  end if;
  return case when found then 'ok' else 'unknown' end; -- a wrong secret looks like a wrong code
end;
$$;

-- The teacher reveals a question: it closes, and stays closed. 'ok' | 'unknown' | 'invalid'.
create or replace function public.lesson_reveal(p_code text, p_secret uuid, p_q_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' then return 'invalid'; end if;
  if p_q_key is null or char_length(p_q_key) not between 1 and 40 or p_q_key !~ '^[A-Za-z0-9:_-]+$' then return 'invalid'; end if;
  perform 1 from public.lesson_rooms where code = p_code and secret = p_secret and created_at > now() - interval '24 hours';
  if not found then return 'unknown'; end if;
  insert into public.lesson_closed (room, q_key) values (p_code, p_q_key) on conflict do nothing;
  update public.lesson_rooms set q_open = false where code = p_code and q_key = p_q_key;
  return 'ok';
end;
$$;

-- A phone votes. 'ok' | 'closed' | 'unknown' | 'room_full' | 'too_many_changes' | 'invalid'.
-- One row per (room, question, token): a second tap or a changed mind updates it.
create or replace function public.lesson_cast_vote(p_code text, p_q_key text, p_token uuid, p_letter text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.lesson_rooms%rowtype;
  v_letter  text := upper(p_letter);
  v_old     public.lesson_votes%rowtype;
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' or p_token is null or v_letter is null or v_letter not in ('A', 'B', 'C', 'D')
     or p_q_key is null or char_length(p_q_key) not between 1 and 40 then
    return 'invalid';
  end if;
  select * into v_room from public.lesson_rooms where code = p_code and created_at > now() - interval '24 hours';
  if not found then return 'unknown'; end if;
  if v_room.q_key is distinct from p_q_key or not v_room.q_open then return 'closed'; end if;

  select * into v_old from public.lesson_votes where room = p_code and q_key = p_q_key and token = p_token;
  if found then
    if v_old.letter = v_letter then return 'ok'; end if;
    if v_old.changes >= 20 then return 'too_many_changes'; end if;
    update public.lesson_votes set letter = v_letter, changes = changes + 1, updated_at = now()
      where room = p_code and q_key = p_q_key and token = p_token;
    return 'ok';
  end if;

  if not exists (select 1 from public.lesson_votes where room = p_code and token = p_token)
     and (select count(distinct token) from public.lesson_votes where room = p_code) >= 300 then
    return 'room_full';
  end if;
  insert into public.lesson_votes (room, q_key, token, letter) values (p_code, p_q_key, p_token, v_letter)
    on conflict (room, q_key, token) do update set letter = excluded.letter, updated_at = now(); -- two taps at once
  return 'ok';
end;
$$;

-- What anyone with the code may see: the current question and counts. null for an unknown or expired room.
create or replace function public.lesson_room_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.lesson_rooms%rowtype;
  v_a int := 0; v_b int := 0; v_c int := 0; v_d int := 0;
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' then return null; end if;
  select * into v_room from public.lesson_rooms where code = p_code and created_at > now() - interval '24 hours';
  if not found then return null; end if;
  if v_room.q_key is not null then
    select count(*) filter (where letter = 'A'), count(*) filter (where letter = 'B'),
           count(*) filter (where letter = 'C'), count(*) filter (where letter = 'D')
      into v_a, v_b, v_c, v_d
      from public.lesson_votes where room = p_code and q_key = v_room.q_key;
  end if;
  return jsonb_build_object(
    'q_key', v_room.q_key,
    'q_label', v_room.q_label,
    'open', v_room.q_key is not null and v_room.q_open,
    'counts', jsonb_build_object('A', v_a, 'B', v_b, 'C', v_c, 'D', v_d),
    'total', v_a + v_b + v_c + v_d
  );
end;
$$;

-- Only the five functions are reachable, and only by these roles; the tables stay closed.
revoke all on function public.lesson_create_room() from public;
revoke all on function public.lesson_set_question(text, uuid, text, text) from public;
revoke all on function public.lesson_reveal(text, uuid, text) from public;
revoke all on function public.lesson_cast_vote(text, text, uuid, text) from public;
revoke all on function public.lesson_room_state(text) from public;
grant execute on function public.lesson_create_room() to anon, authenticated;
grant execute on function public.lesson_set_question(text, uuid, text, text) to anon, authenticated;
grant execute on function public.lesson_reveal(text, uuid, text) to anon, authenticated;
grant execute on function public.lesson_cast_vote(text, text, uuid, text) to anon, authenticated;
grant execute on function public.lesson_room_state(text) to anon, authenticated;

-- Ask PostgREST to pick the new functions up at once.
notify pgrst, 'reload schema';

-- Quaera Lab: phone voting, part 2. One more read-only function for the results slide of a lesson plan (plan item `r`).
--
-- WHAT IT IS: `lesson_room_summary(p_code)` gives the votes of every question a room has had, as aggregates only:
--   [{"q_key": "w1", "counts": {"A": 3, "B": 1, "C": 0, "D": 0}, "total": 4}, ...]
-- Same rules as `lesson_room_state` in 0001: the code must look like a code, a room older than 24 h is gone (null), tokens and
-- rows are never returned. Needs 0001_lesson_voting.sql to have been run first.
--
-- HOW TO RUN: once, in the Supabase dashboard → SQL editor → paste the whole file → Run. Safe to re-run (`create or replace`).
-- Until it is run, the results slide shows only the hand counts and says "Phone results need the summary update".

create or replace function public.lesson_room_summary(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
  v_rows  jsonb;
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{5}$' then return null; end if;
  select true into v_found from public.lesson_rooms where code = p_code and created_at > now() - interval '24 hours';
  if v_found is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'q_key', q_key,
           'counts', jsonb_build_object('A', a, 'B', b, 'C', c, 'D', d),
           'total', a + b + c + d
         ) order by q_key), '[]'::jsonb)
    into v_rows
    from (
      select q_key,
             count(*) filter (where letter = 'A') as a,
             count(*) filter (where letter = 'B') as b,
             count(*) filter (where letter = 'C') as c,
             count(*) filter (where letter = 'D') as d
        from public.lesson_votes
       where room = p_code
       group by q_key
    ) t;
  return v_rows;
end;
$$;

revoke all on function public.lesson_room_summary(text) from public;
grant execute on function public.lesson_room_summary(text) to anon, authenticated;

-- Ask PostgREST to pick the new function up at once.
notify pgrst, 'reload schema';

-- Keep ZeroJudge-style problem IDs independent from any retired seed problem.
-- Supports 4-12 numeric IDs or one lowercase letter followed by 3-11 digits.

alter table public.problems
  drop constraint if exists problems_id_check;

alter table public.problems
  add constraint problems_id_check
  check (id ~ '^([0-9]{4,12}|[a-z][0-9]{3,11})$');

comment on constraint problems_id_check on public.problems is
  'Allows Code Tutor numeric IDs and ZeroJudge-style IDs such as j607.';

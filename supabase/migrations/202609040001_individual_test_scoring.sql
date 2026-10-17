-- Add per-case scoring to formal Judge cases and server-only generation drafts.
-- Existing formal cases are redistributed to preserve every group's current score.

alter table public.problem_test_cases
  add column if not exists score_points smallint not null default 5
    check (score_points between 0 and 100);

alter table public.problem_generation_batch_cases
  add column if not exists score_points smallint not null default 5
    check (score_points between 0 and 100);

with ranked as (
  select
    cases.id,
    groups.score_percent,
    count(*) over (partition by cases.group_id) as case_count,
    row_number() over (partition by cases.group_id order by cases.case_order) as position
  from public.problem_test_cases as cases
  join public.problem_test_groups as groups on groups.id = cases.group_id
)
update public.problem_test_cases as cases
set score_points =
  floor(ranked.score_percent::numeric / ranked.case_count)::smallint
  + case when ranked.position <= (ranked.score_percent % ranked.case_count) then 1 else 0 end
from ranked
where ranked.id = cases.id;

drop function if exists public.apply_problem_generation_batch(uuid, integer, boolean);

create or replace function public.apply_problem_generation_batch(
  p_batch_id uuid,
  p_group_order integer,
  p_replace_existing boolean default true,
  p_case_scores smallint[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem_id text;
  v_group_id uuid;
  v_batch_status text;
  v_existing_count integer;
  v_batch_count integer;
  v_group_score integer;
begin
  select problem_id, status
    into v_problem_id, v_batch_status
  from public.problem_generation_batches
  where id = p_batch_id
  for update;

  if v_problem_id is null or v_batch_status <> 'draft' then
    raise exception 'Generation batch is missing or is not a draft.';
  end if;

  select id into v_group_id
  from public.problem_test_groups
  where problem_id = v_problem_id and group_order = p_group_order
  for update;

  if v_group_id is null then
    raise exception 'Target scoring group does not exist.';
  end if;

  select count(*) into v_batch_count
  from public.problem_generation_batch_cases
  where batch_id = p_batch_id;

  if p_case_scores is not null and cardinality(p_case_scores) <> v_batch_count then
    raise exception 'A score is required for every generated case.';
  end if;
  if p_case_scores is not null and exists (
    select 1 from unnest(p_case_scores) as score where score < 0 or score > 100
  ) then
    raise exception 'Each case score must be between 0 and 100.';
  end if;

  if p_replace_existing then
    delete from public.problem_test_cases where group_id = v_group_id;
    v_existing_count := 0;
  else
    select count(*) into v_existing_count
    from public.problem_test_cases where group_id = v_group_id;
  end if;

  if v_existing_count + v_batch_count > 500 then
    raise exception 'A scoring group cannot exceed 500 cases.';
  end if;

  insert into public.problem_test_cases (
    group_id, case_order, input, expected_output, score_points, source_kind,
    generator_version, generator_seed, input_sha256, generation_strategy
  )
  select
    v_group_id,
    v_existing_count + batch_cases.case_order,
    batch_cases.input,
    batch_cases.expected_output,
    coalesce(p_case_scores[batch_cases.case_order], batch_cases.score_points),
    'generated',
    (select generator_version from public.problem_generation_batches where id = p_batch_id),
    batch_cases.generator_seed,
    batch_cases.input_sha256,
    batch_cases.generation_strategy
  from public.problem_generation_batch_cases as batch_cases
  where batch_cases.batch_id = p_batch_id
  order by batch_cases.case_order;

  select coalesce(sum(score_points), 0) into v_group_score
  from public.problem_test_cases where group_id = v_group_id;
  if v_group_score < 1 or v_group_score > 100 then
    raise exception 'The scoring group total must be between 1 and 100 points.';
  end if;

  update public.problem_test_groups
  set test_case_count = v_existing_count + v_batch_count,
      score_percent = v_group_score
  where id = v_group_id;

  update public.problem_generation_batches
  set status = 'applied', applied_at = timezone('utc', now())
  where id = p_batch_id;

  return v_batch_count;
end;
$$;

revoke all on function public.apply_problem_generation_batch(uuid, integer, boolean, smallint[])
  from public, anon, authenticated;
grant execute on function public.apply_problem_generation_batch(uuid, integer, boolean, smallint[])
  to service_role;

comment on column public.problem_test_cases.score_points is
  'Points awarded when this individual hidden test case passes.';
comment on column public.problem_generation_batch_cases.score_points is
  'Default or administrator-adjusted points applied with this generated case.';

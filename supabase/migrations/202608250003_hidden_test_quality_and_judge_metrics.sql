-- Complete hidden-test quality drafts, strategy metadata, and Judge metrics.
-- Apply after 202608250002_hidden_test_generation.sql.

alter table public.problem_test_cases
  add column if not exists generation_strategy text not null default 'manual'
    check (generation_strategy in (
      'manual', 'basic', 'boundary', 'extreme', 'special',
      'duplicate', 'ordered', 'large_random'
    ));

alter table public.submissions
  add column if not exists peak_memory_kb integer
    check (peak_memory_kb is null or peak_memory_kb >= 0);

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in (
  'accepted', 'wrong_answer', 'compile_error', 'runtime_error',
  'timeout', 'memory_limit', 'output_limit', 'system_error',
  'service_unavailable', 'server_busy'
));

create table if not exists public.problem_generation_batches (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null references public.problems(id) on delete cascade,
  generator_version text not null,
  status text not null default 'draft'
    check (status in ('draft', 'applied', 'discarded')),
  requested_count integer not null check (requested_count between 1 and 100),
  accepted_count integer not null check (accepted_count between 1 and 100),
  attempted_count integer not null check (attempted_count >= accepted_count),
  quality_report jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quality_report) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  applied_at timestamptz
);

create table if not exists public.problem_generation_batch_cases (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.problem_generation_batches(id) on delete cascade,
  case_order integer not null check (case_order >= 1),
  input text not null check (octet_length(input) between 1 and 65536),
  expected_output text not null check (octet_length(expected_output) between 1 and 65536),
  generation_strategy text not null check (generation_strategy in (
    'basic', 'boundary', 'extreme', 'special',
    'duplicate', 'ordered', 'large_random'
  )),
  generator_seed bigint not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  input_bytes integer not null check (input_bytes between 1 and 65536),
  output_bytes integer not null check (output_bytes between 1 and 65536),
  unique (batch_id, case_order),
  unique (batch_id, input_sha256)
);

create index if not exists problem_generation_batches_problem_index
  on public.problem_generation_batches (problem_id, created_at desc);
create index if not exists problem_generation_batch_cases_batch_index
  on public.problem_generation_batch_cases (batch_id, case_order);

alter table public.problem_generation_batches enable row level security;
alter table public.problem_generation_batch_cases enable row level security;

-- These tables contain hidden tests. Browsers must never read them directly.
revoke all on public.problem_generation_batches from anon, authenticated;
revoke all on public.problem_generation_batch_cases from anon, authenticated;
grant all on public.problem_generation_batches to service_role;
grant all on public.problem_generation_batch_cases to service_role;

create or replace function public.apply_problem_generation_batch(
  p_batch_id uuid,
  p_group_order integer,
  p_replace_existing boolean default true
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

  if p_replace_existing then
    delete from public.problem_test_cases where group_id = v_group_id;
    v_existing_count := 0;
  else
    select count(*) into v_existing_count
    from public.problem_test_cases where group_id = v_group_id;
  end if;

  select count(*) into v_batch_count
  from public.problem_generation_batch_cases where batch_id = p_batch_id;

  if v_existing_count + v_batch_count > 500 then
    raise exception 'A scoring group cannot exceed 500 cases.';
  end if;

  insert into public.problem_test_cases (
    group_id, case_order, input, expected_output, source_kind,
    generator_version, generator_seed, input_sha256, generation_strategy
  )
  select
    v_group_id,
    v_existing_count + case_order,
    input,
    expected_output,
    'generated',
    (select generator_version from public.problem_generation_batches where id = p_batch_id),
    generator_seed,
    input_sha256,
    generation_strategy
  from public.problem_generation_batch_cases
  where batch_id = p_batch_id
  order by case_order;

  update public.problem_test_groups
  set test_case_count = v_existing_count + v_batch_count
  where id = v_group_id;

  update public.problem_generation_batches
  set status = 'applied', applied_at = timezone('utc', now())
  where id = p_batch_id;

  return v_batch_count;
end;
$$;

revoke all on function public.apply_problem_generation_batch(uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_problem_generation_batch(uuid, integer, boolean)
  to service_role;

comment on table public.problem_generation_batches is
  'Server-only validated hidden-test drafts awaiting explicit administrator application.';

-- Private, versioned hidden-test generation support.
-- Apply after 202608230001_problem_judge.sql.

create table if not exists public.problem_generation_versions (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null references public.problems(id) on delete cascade,
  version text not null check (version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$'),
  generator_language text not null check (generator_language in ('cpp', 'python')),
  generator_source text not null check (char_length(generator_source) between 1 and 65536),
  reference_language text not null check (reference_language in ('cpp', 'python')),
  reference_source text not null check (char_length(reference_source) between 1 and 65536),
  validator_language text check (validator_language in ('cpp', 'python')),
  validator_source text check (validator_source is null or char_length(validator_source) between 1 and 65536),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (problem_id, version),
  check ((validator_language is null) = (validator_source is null))
);

alter table public.problem_test_cases
  add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('manual', 'generated')),
  add column if not exists generator_version text,
  add column if not exists generator_seed bigint,
  add column if not exists input_sha256 text;

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in (
  'accepted', 'wrong_answer', 'compile_error', 'runtime_error',
  'timeout', 'output_limit', 'service_unavailable', 'server_busy'
));

create index if not exists problem_generation_versions_problem_index
  on public.problem_generation_versions (problem_id, created_at desc);

create index if not exists problem_test_cases_hash_index
  on public.problem_test_cases (input_sha256)
  where input_sha256 is not null;

alter table public.problem_generation_versions enable row level security;

-- Deliberately no anon/authenticated policies: these rows contain secret source code.
revoke all on public.problem_generation_versions from anon, authenticated;
grant all on public.problem_generation_versions to service_role;

comment on table public.problem_generation_versions is
  'Server-only Generator, Reference Solution, and optional Validator versions. Never expose through public APIs.';

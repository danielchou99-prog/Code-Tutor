-- Code Tutor: per-user saved code for each problem and programming language.

create table if not exists public.problem_code_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete cascade,
  language text not null check (language in ('cpp', 'python')),
  code text not null check (octet_length(code) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, problem_id, language)
);

create index if not exists problem_code_drafts_owner_problem_index
  on public.problem_code_drafts (user_id, problem_id, updated_at desc);

create or replace function public.set_problem_code_draft_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_problem_code_draft_updated_at on public.problem_code_drafts;
create trigger set_problem_code_draft_updated_at
before update on public.problem_code_drafts
for each row execute function public.set_problem_code_draft_updated_at();

alter table public.problem_code_drafts enable row level security;

drop policy if exists "Users can read their problem code" on public.problem_code_drafts;
create policy "Users can read their problem code"
on public.problem_code_drafts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their problem code" on public.problem_code_drafts;
create policy "Users can create their problem code"
on public.problem_code_drafts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their problem code" on public.problem_code_drafts;
create policy "Users can update their problem code"
on public.problem_code_drafts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their problem code" on public.problem_code_drafts;
create policy "Users can delete their problem code"
on public.problem_code_drafts for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.problem_code_drafts to authenticated;
revoke all on function public.set_problem_code_draft_updated_at() from public, anon, authenticated;

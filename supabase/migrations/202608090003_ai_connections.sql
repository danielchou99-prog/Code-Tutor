-- Code Tutor: encrypted user-owned AI provider connections and daily usage.

create table if not exists public.ai_connections (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('groq')),
  encrypted_key text not null check (char_length(encrypted_key) between 40 and 2048),
  key_last_four text not null check (char_length(key_last_four) = 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('groq')),
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, usage_date)
);

create or replace function public.set_ai_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_connection_updated_at on public.ai_connections;
create trigger set_ai_connection_updated_at
before update on public.ai_connections
for each row execute function public.set_ai_record_updated_at();

drop trigger if exists set_ai_usage_updated_at on public.ai_usage;
create trigger set_ai_usage_updated_at
before update on public.ai_usage
for each row execute function public.set_ai_record_updated_at();

alter table public.ai_connections enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "Users can read their AI connections" on public.ai_connections;
create policy "Users can read their AI connections"
on public.ai_connections for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their AI connections" on public.ai_connections;
create policy "Users can create their AI connections"
on public.ai_connections for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their AI connections" on public.ai_connections;
create policy "Users can update their AI connections"
on public.ai_connections for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their AI connections" on public.ai_connections;
create policy "Users can delete their AI connections"
on public.ai_connections for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their AI usage" on public.ai_usage;
create policy "Users can read their AI usage"
on public.ai_usage for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their AI usage" on public.ai_usage;
create policy "Users can create their AI usage"
on public.ai_usage for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their AI usage" on public.ai_usage;
create policy "Users can update their AI usage"
on public.ai_usage for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ai_connections to authenticated;
grant select, insert, update on public.ai_usage to authenticated;

revoke all on function public.set_ai_record_updated_at() from public, anon, authenticated;

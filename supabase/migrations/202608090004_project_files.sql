-- Code Tutor: multiple source files inside each user-owned project.

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.file_items(id) on delete cascade,
  name text not null check (
    char_length(btrim(name)) between 1 and 120
    and position('/' in name) = 0
    and position(E'\\' in name) = 0
    and lower(name) ~ '\.(cpp|h|hpp)$'
  ),
  content text not null default '' check (octet_length(content) <= 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_files_unique_name
  on public.project_files (project_id, lower(name));

create index if not exists project_files_owner_project_index
  on public.project_files (user_id, project_id, updated_at desc);

create or replace function public.validate_project_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name = btrim(new.name);

  if not exists (
    select 1
    from public.file_items project
    where project.id = new.project_id
      and project.user_id = new.user_id
      and project.kind = 'project'
  ) then
    raise exception 'Project must be owned by the same user.';
  end if;

  if tg_op = 'INSERT' and (
    select count(*) from public.project_files existing
    where existing.project_id = new.project_id
  ) >= 50 then
    raise exception 'A project can contain at most 50 files.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_file on public.project_files;
create trigger validate_project_file
before insert or update on public.project_files
for each row execute function public.validate_project_file();

create or replace function public.set_project_file_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_file_updated_at on public.project_files;
create trigger set_project_file_updated_at
before update on public.project_files
for each row execute function public.set_project_file_updated_at();

create or replace function public.touch_project_from_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  parent_project_id uuid;
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    parent_project_id := old.project_id;
  else
    owner_id := new.user_id;
    parent_project_id := new.project_id;
  end if;

  update public.file_items
  set updated_at = now()
  where id = parent_project_id and user_id = owner_id and kind = 'project';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists touch_project_from_file on public.project_files;
create trigger touch_project_from_file
after insert or update or delete on public.project_files
for each row execute function public.touch_project_from_file();

insert into public.project_files (user_id, project_id, name, content, created_at, updated_at)
select
  project.user_id,
  project.id,
  'main.cpp',
  coalesce(project.content, ''),
  project.created_at,
  project.updated_at
from public.file_items project
where project.kind = 'project'
on conflict do nothing;

create or replace function public.create_project_main_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'project' then
    insert into public.project_files (user_id, project_id, name, content)
    values (new.user_id, new.id, 'main.cpp', coalesce(new.content, ''))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_project_main_file on public.file_items;
create trigger create_project_main_file
after insert on public.file_items
for each row execute function public.create_project_main_file();

alter table public.project_files enable row level security;

drop policy if exists "Users can read their project files" on public.project_files;
create policy "Users can read their project files"
on public.project_files for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their project files" on public.project_files;
create policy "Users can create their project files"
on public.project_files for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their project files" on public.project_files;
create policy "Users can update their project files"
on public.project_files for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their project files" on public.project_files;
create policy "Users can delete their project files"
on public.project_files for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.project_files to authenticated;

revoke all on function public.validate_project_file() from public, anon, authenticated;
revoke all on function public.set_project_file_updated_at() from public, anon, authenticated;
revoke all on function public.touch_project_from_file() from public, anon, authenticated;
revoke all on function public.create_project_main_file() from public, anon, authenticated;

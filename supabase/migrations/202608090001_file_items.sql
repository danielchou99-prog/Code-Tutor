-- Code Tutor: user-owned folders, projects, tags, and C++ source code.

create table if not exists public.file_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.file_items(id) on delete cascade,
  kind text not null check (kind in ('folder', 'project')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 8),
  language text check (
    (kind = 'folder' and language is null) or
    (kind = 'project' and language = 'cpp')
  ),
  content text check (content is null or octet_length(content) <= 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists file_items_unique_name_in_folder
  on public.file_items (
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index if not exists file_items_parent_index
  on public.file_items (user_id, parent_id, kind, updated_at desc);

create index if not exists file_items_tags_index
  on public.file_items using gin (tags);

create or replace function public.set_file_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_file_item_updated_at on public.file_items;
create trigger set_file_item_updated_at
before update on public.file_items
for each row execute function public.set_file_item_updated_at();

create or replace function public.validate_file_item_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name = btrim(new.name);

  if new.parent_id is not null and not exists (
    select 1
    from public.file_items parent
    where parent.id = new.parent_id
      and parent.user_id = new.user_id
      and parent.kind = 'folder'
  ) then
    raise exception 'Parent must be a folder owned by the same user.';
  end if;

  if exists (
    select 1
    from unnest(new.tags) as tag
    where char_length(tag) < 1 or char_length(tag) > 32 or tag like '%#%' or tag ~ '\\s'
  ) then
    raise exception 'Tags must contain 1 to 32 non-space characters without #.';
  end if;

  if cardinality(new.tags) <> cardinality(array(select distinct tag from unnest(new.tags) as tag)) then
    raise exception 'Duplicate tags are not allowed.';
  end if;

  if new.kind = 'folder' then
    new.language = null;
    new.content = null;
  elsif new.language is null then
    new.language = 'cpp';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_file_item_parent on public.file_items;
create trigger validate_file_item_parent
before insert or update on public.file_items
for each row execute function public.validate_file_item_parent();

alter table public.file_items enable row level security;

drop policy if exists "Users can read their file items" on public.file_items;
create policy "Users can read their file items"
on public.file_items for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their file items" on public.file_items;
create policy "Users can create their file items"
on public.file_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their file items" on public.file_items;
create policy "Users can update their file items"
on public.file_items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their file items" on public.file_items;
create policy "Users can delete their file items"
on public.file_items for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.file_items to authenticated;

revoke all on function public.set_file_item_updated_at() from public, anon, authenticated;
revoke all on function public.validate_file_item_parent() from public, anon, authenticated;

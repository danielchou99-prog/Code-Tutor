-- Code Tutor: repair Python project creation after the language constraint was updated.
-- This migration is safe to run again from the Supabase SQL Editor.

alter table public.file_items
  drop constraint if exists file_items_language_check;

alter table public.file_items
  add constraint file_items_language_check check (
    (kind = 'folder' and language is null) or
    (kind = 'project' and language in ('cpp', 'python'))
  );

alter table public.project_files
  drop constraint if exists project_files_name_check;

alter table public.project_files
  add constraint project_files_name_check check (
    char_length(btrim(name)) between 1 and 120
    and position('/' in name) = 0
    and position(E'\\' in name) = 0
    and lower(name) ~ '\.(cpp|h|hpp|py)$'
  );

create or replace function public.validate_project_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_language text;
begin
  new.name = btrim(new.name);

  select project.language into project_language
  from public.file_items project
  where project.id = new.project_id
    and project.user_id = new.user_id
    and project.kind = 'project';

  if project_language is null then
    raise exception 'Project must be owned by the same user.';
  end if;

  if project_language = 'cpp' and lower(new.name) !~ '\.(cpp|h|hpp)$' then
    raise exception 'C++ projects support .cpp, .h, and .hpp files.';
  elsif project_language = 'python' and lower(new.name) !~ '\.py$' then
    raise exception 'Python projects support .py files.';
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

create or replace function public.create_project_main_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'project' then
    insert into public.project_files (user_id, project_id, name, content)
    values (
      new.user_id,
      new.id,
      case when new.language = 'python' then 'main.py' else 'main.cpp' end,
      coalesce(new.content, '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists create_project_main_file on public.file_items;
create trigger create_project_main_file
after insert on public.file_items
for each row execute function public.create_project_main_file();

revoke all on function public.validate_project_file() from public, anon, authenticated;
revoke all on function public.create_project_main_file() from public, anon, authenticated;

do $$
declare
  file_item_rule text;
  project_file_rule text;
  main_file_function text;
begin
  select pg_get_constraintdef(oid) into file_item_rule
  from pg_constraint
  where conrelid = 'public.file_items'::regclass
    and conname = 'file_items_language_check';

  select pg_get_constraintdef(oid) into project_file_rule
  from pg_constraint
  where conrelid = 'public.project_files'::regclass
    and conname = 'project_files_name_check';

  select pg_get_functiondef('public.create_project_main_file()'::regprocedure)
  into main_file_function;

  if file_item_rule is null or position('python' in lower(file_item_rule)) = 0 then
    raise exception 'Python is still missing from file_items_language_check.';
  end if;
  if project_file_rule is null or position('py' in lower(project_file_rule)) = 0 then
    raise exception 'The .py extension is still missing from project_files_name_check.';
  end if;
  if main_file_function is null or position('main.py' in lower(main_file_function)) = 0 then
    raise exception 'create_project_main_file() still does not create main.py.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

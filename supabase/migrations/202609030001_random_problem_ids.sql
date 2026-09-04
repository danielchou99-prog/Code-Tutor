-- Convert every existing problem ID to one lowercase letter plus three digits.
-- New IDs are allocated by the backend after this migration.

begin;

create table if not exists public.problem_id_aliases (
  old_id text primary key,
  new_id text not null unique check (new_id ~ '^[a-z][0-9]{3}$'),
  migrated_at timestamptz not null default timezone('utc', now())
);

alter table public.problem_id_aliases enable row level security;

drop policy if exists "Problem ID aliases are publicly readable" on public.problem_id_aliases;
create policy "Problem ID aliases are publicly readable"
on public.problem_id_aliases for select
using (true);

grant select on public.problem_id_aliases to anon, authenticated;
grant all on public.problem_id_aliases to service_role;

alter table public.problem_tag_links
  drop constraint if exists problem_tag_links_problem_id_fkey;
alter table public.problem_tag_links
  add constraint problem_tag_links_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

alter table public.problem_samples
  drop constraint if exists problem_samples_problem_id_fkey;
alter table public.problem_samples
  add constraint problem_samples_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

alter table public.problem_test_groups
  drop constraint if exists problem_test_groups_problem_id_fkey;
alter table public.problem_test_groups
  add constraint problem_test_groups_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

alter table public.submissions
  drop constraint if exists submissions_problem_id_fkey;
alter table public.submissions
  add constraint submissions_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete restrict;

alter table public.problem_code_drafts
  drop constraint if exists problem_code_drafts_problem_id_fkey;
alter table public.problem_code_drafts
  add constraint problem_code_drafts_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

alter table public.problem_generation_versions
  drop constraint if exists problem_generation_versions_problem_id_fkey;
alter table public.problem_generation_versions
  add constraint problem_generation_versions_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

alter table public.problem_generation_batches
  drop constraint if exists problem_generation_batches_problem_id_fkey;
alter table public.problem_generation_batches
  add constraint problem_generation_batches_problem_id_fkey
  foreign key (problem_id) references public.problems(id)
  on update cascade on delete cascade;

do $$
declare
  current_problem record;
  mapping record;
  candidate text;
begin
  -- An existing alias row is the migration marker. This protects SQL Editor
  -- users from accidentally randomizing every problem a second time.
  if not exists (select 1 from public.problem_id_aliases) then
    for current_problem in select id from public.problems order by id loop
      loop
        candidate := chr(97 + floor(random() * 26)::integer)
          || lpad(floor(random() * 1000)::integer::text, 3, '0');
        exit when not exists (
          select 1 from public.problems where id = candidate
        ) and not exists (
          select 1 from public.problem_id_aliases where new_id = candidate
        );
      end loop;

      insert into public.problem_id_aliases (old_id, new_id)
      values (current_problem.id, candidate);
    end loop;

    for mapping in select old_id, new_id from public.problem_id_aliases order by old_id loop
      update public.problems
      set id = mapping.new_id
      where id = mapping.old_id;
    end loop;
  end if;
end
$$;

alter table public.problems
  drop constraint if exists problems_id_check;
alter table public.problems
  add constraint problems_id_check
  check (id ~ '^[a-z][0-9]{3}$');

alter table public.problem_id_aliases
  drop constraint if exists problem_id_aliases_new_id_fkey;
alter table public.problem_id_aliases
  add constraint problem_id_aliases_new_id_fkey
  foreign key (new_id) references public.problems(id)
  on update cascade on delete cascade;

comment on constraint problems_id_check on public.problems is
  'Dev Compass problem IDs contain one lowercase letter and exactly three digits.';

comment on table public.problem_id_aliases is
  'Maps pre-migration problem IDs to their random four-character replacements.';

commit;

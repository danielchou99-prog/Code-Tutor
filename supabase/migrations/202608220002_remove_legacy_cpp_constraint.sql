-- Code Tutor: remove the original unnamed-style check that still allowed C++ only.
-- The newer file_items_language_check already permits both cpp and python.

alter table public.file_items
  drop constraint if exists file_items_check;

do $$
declare
  remaining_cpp_only_rule text;
begin
  select string_agg(pg_get_constraintdef(oid), E'\n')
  into remaining_cpp_only_rule
  from pg_constraint
  where conrelid = 'public.file_items'::regclass
    and contype = 'c'
    and lower(pg_get_constraintdef(oid)) like '%language%'
    and lower(pg_get_constraintdef(oid)) not like '%python%';

  if remaining_cpp_only_rule is not null then
    raise exception 'A legacy C++-only file_items constraint still exists: %', remaining_cpp_only_rule;
  end if;
end;
$$;

notify pgrst, 'reload schema';

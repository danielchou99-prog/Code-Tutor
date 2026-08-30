-- Retire the temporary ZeroJudge h027 fixture after the hidden-test plan passed.
-- The original add migration remains immutable migration history.

begin;

-- submissions intentionally use ON DELETE RESTRICT, so remove them first.
delete from public.submissions where problem_id = 'h027';

-- All other problem-owned rows (drafts, tags, samples, groups/cases,
-- generation versions, server drafts) use ON DELETE CASCADE.
delete from public.problems where id = 'h027';

do $$
begin
  if exists (select 1 from public.problems where id = 'h027') then
    raise exception 'h027 retirement verification failed.';
  end if;
end;
$$;

commit;

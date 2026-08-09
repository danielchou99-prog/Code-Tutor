-- Code Tutor: prevent a folder from being moved into itself or one of its descendants.

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

  if new.kind = 'folder' and new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A folder cannot be moved into itself.';
    end if;

    if exists (
      with recursive descendants as (
        select child.id
        from public.file_items child
        where child.parent_id = new.id
          and child.user_id = new.user_id

        union all

        select child.id
        from public.file_items child
        join descendants descendant on child.parent_id = descendant.id
        where child.user_id = new.user_id
      )
      select 1 from descendants where id = new.parent_id
    ) then
      raise exception 'A folder cannot be moved into one of its descendants.';
    end if;
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

revoke all on function public.validate_file_item_parent() from public, anon, authenticated;

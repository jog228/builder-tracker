-- Admins move an update to another project ("this link is Campus Crush, not
-- Studlin"). The project lives on message_scores.project; every change is
-- logged here, signed by the admin, and shown in the Decisions list on
-- /admin/shipped. UI: "Change project" on a profile's Recent updates.

create table public.project_reassignments (
  id            uuid primary key default gen_random_uuid(),
  message_id    text not null references public.messages (id) on delete cascade,
  from_project  text,
  to_project    text not null check (length(trim(to_project)) between 1 and 60),
  changed_by    uuid references public.members (id) on delete set null,
  changed_at    timestamptz not null default now()
);
create index project_reassignments_changed_idx
  on public.project_reassignments (changed_at desc);

alter table public.project_reassignments enable row level security;
revoke all on public.project_reassignments from anon, authenticated;
grant select on public.project_reassignments to authenticated;
grant all on public.project_reassignments to service_role;

-- Only admins see the log (the Decisions list is admin-only). Nobody writes
-- it directly: reassign_project() is the single write path.
create policy "admins read" on public.project_reassignments
  for select to authenticated using ((select public.is_admin()));

-- Sets a scored message's project and logs who did it, atomically. Admins
-- only (42501 otherwise). A no-op (same name) logs nothing. Returns the log
-- row id, or null for a no-op.
create function public.reassign_project(p_message_id text, p_project text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_project, ''), '\s+', ' ', 'g'));
  v_from text;
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can change projects' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 60 then
    raise exception 'project name must be 1-60 characters' using errcode = '22023';
  end if;

  select project into v_from
    from public.message_scores where message_id = p_message_id for update;
  if not found then
    raise exception 'message % is not scored', p_message_id using errcode = 'P0002';
  end if;
  if v_from is not distinct from v_name then
    return null;
  end if;

  update public.message_scores set project = v_name where message_id = p_message_id;
  insert into public.project_reassignments (message_id, from_project, to_project, changed_by)
    values (p_message_id, v_from, v_name, public.current_member_id())
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reassign_project(text, text) from public, anon;
grant execute on function public.reassign_project(text, text) to authenticated;

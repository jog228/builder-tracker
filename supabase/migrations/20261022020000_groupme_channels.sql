-- GroupMe subtopics ("Goals & Progress", "Introductions", "Resources") are separate
-- message streams. Track which channel each message came from, and keep one
-- sync cursor per channel (sync_runs.source = 'groupme:<channel id>').

alter table public.messages
  add column channel_id text,
  add column channel_name text;

-- Everything ingested so far came from the main chat; its id is in raw.group_id.
update public.messages
set channel_id = raw ->> 'group_id', channel_name = 'Main'
where channel_id is null;

alter table public.messages alter column channel_id set not null;
create index messages_channel_created_idx on public.messages (channel_id, created_at);

update public.sync_runs r
set source = 'groupme:' || (m.raw ->> 'group_id')
from public.messages m
where r.source = 'groupme' and m.id = r.cursor;

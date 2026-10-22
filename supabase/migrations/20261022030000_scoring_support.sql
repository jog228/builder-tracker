-- Phase 2 (AI message scoring) support.

-- Replies give the classifier context ("Vetwork?" only makes sense next to the
-- question it answers). Stored as a column so it survives purging `raw`.
alter table public.messages add column reply_to_id text;

update public.messages m
set reply_to_id = (
  select a ->> 'reply_id'
  from jsonb_array_elements(m.raw -> 'attachments') a
  where a ->> 'type' = 'reply'
  limit 1
)
where m.reply_to_id is null and jsonb_typeof(m.raw -> 'attachments') = 'array';

-- Per-run metrics (token usage, cost, counts) for scoring and future syncs.
alter table public.sync_runs add column stats jsonb;

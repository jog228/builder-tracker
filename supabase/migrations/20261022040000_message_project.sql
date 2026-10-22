-- The project a scored message is about, as extracted by the classifier
-- (null when none is named). "Shipped" counts once per member per project.
alter table public.message_scores add column project text;

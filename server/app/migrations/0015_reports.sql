-- What players report wrong with a pack question (app/reports.py). A question's id is a hash
-- of its content, so fixing the question changes it: the snapshot keeps a report readable
-- after, and the id only links while it still matches. No address is kept; the limiter
-- counts in memory.
create table reports (
    id          uuid primary key default gen_random_uuid(),
    mode        text not null,
    question_id text,
    -- The question as filed, or for a price mode the item {id, name}; null for "something else".
    snapshot    jsonb,
    text        text not null,
    status      text not null default 'open' check (status in ('open', 'closed')),
    created_at  timestamptz not null default now()
);

create index reports_by_status on reports (status, created_at);

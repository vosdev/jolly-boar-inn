-- What players suggest for the packs, waiting on the operator (app/suggestions.py). Nothing
-- here plays: an approved row reaches a game only through an export, the import script and a
-- release. No address is kept; the limiter counts in memory.
create table suggestions (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null check (kind in ('question', 'examine', 'item')),
    content      jsonb not null,
    credit       text not null,
    credit_shown boolean not null,
    status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'imported')),
    created_at   timestamptz not null default now(),
    -- Set by an export of the approved rows, so "mark as imported" moves only what the
    -- operator downloaded. An edit or a status change clears it.
    exported_at  timestamptz
);

create index suggestions_by_status on suggestions (status, created_at);

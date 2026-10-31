-- Each day's questions, whole and in play order, so a restart or a pack edit leaves them alone.
-- `day` is the date its 08:00 UTC window opens. Never cleaned up: the draw reads these rows to
-- see when a question was last used.
create table daily_sets (
    day        date primary key,
    questions  jsonb not null,
    created_at timestamptz not null default now()
);

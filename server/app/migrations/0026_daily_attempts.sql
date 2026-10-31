-- A daily room is one player's attempt at a day's set: `daily` is that set's day. Join,
-- lookup and the public list treat such a room as missing.
alter table rooms add column daily date;

-- Each attempt, kept after its room is cleaned up so a second visit still finds the result.
-- `token_hash` is the sha256 of a random token the browser keeps; one attempt per day each.
-- `results` grows by one per close, so a room lost mid-game keeps what was played.
create table daily_attempts (
    day         date not null,
    token_hash  text not null,
    room_id     uuid references rooms (id) on delete set null,
    started_at  timestamptz not null default now(),
    finished_at timestamptz,
    points      integer not null default 0,
    results     text[] not null default '{}'
                check (results <@ array['right', 'partial', 'missed']),
    primary key (day, token_hash)
);
create index daily_attempts_token_idx on daily_attempts (token_hash);
create unique index daily_attempts_room_idx on daily_attempts (room_id);

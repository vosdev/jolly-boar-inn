-- Section 5 of ideas/architecture.md. The runner in app/db.py creates
-- schema_migrations itself before it can read applied versions, so this first
-- statement must tolerate the table already existing.
create table if not exists schema_migrations (
    version    integer primary key,
    applied_at timestamptz not null default now()
);

create table rooms (
    id                     uuid primary key default gen_random_uuid(),
    code                   text not null,
    status                 text not null check (status in ('created', 'lobby', 'playing', 'finished')),
    settings               jsonb not null,
    admin_token_hash       text,                       -- sha256 hex of the single-use token; null once consumed
    admin_token_consumed_at timestamptz,
    current_index          integer,                    -- index into questions.position, null before start
    creator_ip             inet,
    created_at             timestamptz not null default now(),
    expires_at             timestamptz not null
);
create unique index rooms_code_idx on rooms (code);
create index rooms_expires_at_idx on rooms (expires_at);

create table players (
    id                 uuid primary key default gen_random_uuid(),
    room_id            uuid not null references rooms (id) on delete cascade,
    display_name       text not null check (char_length(display_name) between 1 and 24),
    session_token_hash text not null,
    role               text not null default 'player' check (role in ('player', 'admin')),
    joined_at          timestamptz not null default now(),
    last_seen_at       timestamptz not null default now()
);
create unique index players_session_idx on players (session_token_hash);
create unique index players_room_name_idx on players (room_id, lower(display_name));

create table questions (
    id               uuid primary key default gen_random_uuid(),
    room_id          uuid not null references rooms (id) on delete cascade,
    position         integer not null,
    question_id      text not null,                    -- content id from the schema, q_...
    type             text not null,
    source           text not null check (source in ('pack', 'community', 'room')),
    payload          jsonb not null,                   -- full envelope minus id/type/source
    host_only        boolean not null default false,
    author_player_id uuid references players (id) on delete set null,
    shown_at         timestamptz,
    closed_at        timestamptz,
    voided           boolean not null default false,
    unique (room_id, position)
);

create table answers (
    id          bigserial primary key,
    question_id uuid not null references questions (id) on delete cascade,
    player_id   uuid not null references players (id) on delete cascade,
    value       jsonb not null,
    received_at timestamptz not null default now(),
    correct     boolean,                               -- null until the question closes
    points      integer,                               -- null until the question closes
    unique (question_id, player_id)
);
create index answers_player_idx on answers (player_id);

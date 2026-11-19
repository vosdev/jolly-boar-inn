-- A suggester's own screenshot, re-encoded on upload (app/suggestion_pictures.py). Apart from
-- suggestions, so listing the queue never reads the bytes. It goes with its suggestion.
create table suggestion_pictures (
    suggestion_id uuid primary key references suggestions (id) on delete cascade,
    name text not null unique,
    width integer not null check (width > 0),
    height integer not null check (height > 0),
    data bytea not null
);

-- The operator's pending renames and removals of popular items (app/roster_edits.py). The
-- roster lives in git, so nothing here plays: a change leaves in an export for
-- `make edit-roster` and its row is deleted once that is applied. Keyed by the item's id, so
-- a second change to one item replaces the first.
create table roster_edits (
    item_id     integer primary key,
    action      text not null check (action in ('rename', 'remove')),
    -- The new name; null for a removal.
    name        text,
    -- The name the roster held, so the change stays readable once it has left it.
    before      text not null,
    updated_at  timestamptz not null default now(),
    exported_at timestamptz,
    check ((action = 'rename') = (name is not null))
);

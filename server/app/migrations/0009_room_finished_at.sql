-- When the game ended. Cleanup deletes a finished room `FINISHED_ROOM_GRACE_MINUTES` after
-- this, rather than days later at `expires_at`: the players took the result home.
alter table rooms add column finished_at timestamptz;

-- A room that finished before this column existed ended when its last question closed.
-- Without a closed question, the last one shown is the next best guess, then creation.
update rooms r set finished_at = coalesce(
    (select max(q.closed_at) from questions q where q.room_id = r.id),
    (select max(q.shown_at) from questions q where q.room_id = r.id),
    r.created_at
)
where r.status = 'finished';

create index rooms_finished_at_idx on rooms (finished_at) where finished_at is not null;

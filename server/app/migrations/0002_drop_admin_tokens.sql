-- The room's creator is its admin. POST /api/rooms inserts the room, its questions and
-- the admin player in one transaction (section 7), so there is no token to exchange and
-- the `created` status is unreachable.

-- A `created` room is one whose admin link was never used. It has no players by
-- definition, and nothing can claim it any more: left behind, it would be a lobby with
-- no admin, joinable and impossible to start. Deleting cascades to players, questions
-- and answers. This has to run before the constraint below, which validates every
-- existing row the moment it is added -- one stray row would fail the migration and
-- refuse the app its startup.
delete from rooms where status = 'created';

-- No `if exists` on the drop: a wrong name would silently leave the old, permissive
-- constraint in place beside the new one, and nothing would look broken. Fail loudly.
alter table rooms
    drop constraint rooms_status_check,
    add constraint rooms_status_check check (status in ('lobby', 'playing', 'finished'));

alter table rooms
    drop column admin_token_hash,
    drop column admin_token_consumed_at;

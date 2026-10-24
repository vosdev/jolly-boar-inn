-- The room's TV shows the question to the room and plays no part. A room has at most one.
alter table players drop constraint players_role_check;
alter table players add constraint players_role_check check (role in ('player', 'admin', 'tv'));
create unique index players_one_tv on players (room_id) where role = 'tv';

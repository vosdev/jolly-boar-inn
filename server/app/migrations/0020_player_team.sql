-- The god a player plays for in a team game, null outside one and until they pick. The set of
-- gods lives in `app/rooms/teams.py`, so the server checks it before it writes the column.
alter table players add column team text;

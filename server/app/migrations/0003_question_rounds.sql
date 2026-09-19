-- Rounds: a room plays its questions in blocks of one mode, introduced by a splash.
--
-- The round number is stored rather than derived. Runs of equal `type` would break as
-- soon as one mode plays two rounds, which with a single registered mode is every game,
-- and `position / questions_per_round` would break as soon as a round is short. Both
-- failures are silent and both show players the wrong mode on the splash.
--
-- The default makes every existing room a single round, which is what it was.
alter table questions add column round integer not null default 0;

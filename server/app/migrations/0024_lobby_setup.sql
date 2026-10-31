-- A room's questions are selected at start_game, so the host's own wait on the room until
-- then, along with who sent them, who goes down as their author.
alter table rooms add column custom_questions jsonb not null default '[]';
alter table rooms add column custom_author uuid references players (id) on delete set null;

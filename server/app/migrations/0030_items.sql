-- Items for the lower half of the standings. A player holds one, for one round: the slot is
-- three columns on the player, so a restart or a reconnect finds it where it was.
alter table players add column item text;
alter table players add column item_round smallint;
alter table players add column item_charges smallint;

-- What an item added to an answer, kept apart from ``points`` so the base stays the
-- answer's own; the standings sum both.
alter table answers add column item_points smallint not null default 0;
alter table answers add column item text;

-- Games played at this table before the current one, so a rematch deals other items.
alter table rooms add column rematches smallint not null default 0;

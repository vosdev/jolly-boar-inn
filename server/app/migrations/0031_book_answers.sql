-- An answer the Book of Knowledge gave: full credit at the tap, no value of the player's own,
-- and left out of question_stats and answer_timings, though it counts for the standings.
alter table answers add column by_book boolean not null default false;

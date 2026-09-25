-- Deleting a player sets `questions.author_player_id` to null through its foreign key, one
-- lookup per player. Without an index each lookup scans every stored question, so the
-- expiry purge grew with (players deleted) x (questions stored). Partial, because only a
-- host's own questions have an author.
create index questions_author_idx on questions (author_player_id)
    where author_player_id is not null;

-- Written and never read: the rate limiter keeps addresses in memory, and nothing ever
-- updated `last_seen_at` after the insert. An address kept for a room's lifetime with no
-- use is one to drop.
alter table rooms drop column creator_ip;
alter table players drop column last_seen_at;

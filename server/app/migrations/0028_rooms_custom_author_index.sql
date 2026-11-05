-- Deleting a player sets `rooms.custom_author` to null through its foreign key, one lookup
-- per player. Without an index each lookup scans every stored room, so the expiry purge grew
-- with (players deleted) x (rooms stored), as 0008 found for questions. Partial, because
-- only a room with custom questions has an author.
create index rooms_custom_author_idx on rooms (custom_author)
    where custom_author is not null;

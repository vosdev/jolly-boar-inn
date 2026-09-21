-- D4: a player's chat head, as an id in `data/heads/heads.json` (section 5.2 of
-- ideas/design.md). The manifest's index is the contract, so this stores the index.
--
-- Nullable, not `not null default 0`: null is "never chosen", and the client draws that
-- player the head derived from their id. That is what gives a room created before this
-- migration a spread of faces rather than fifty copies of head 0, and it is the same
-- fallback a client uses against a server that predates this column.
--
-- Only the lower bound lives here. The upper one is the manifest's length, which grows
-- without a migration, so the server checks it before it ever writes the column.
alter table players
    add column avatar smallint check (avatar >= 0);

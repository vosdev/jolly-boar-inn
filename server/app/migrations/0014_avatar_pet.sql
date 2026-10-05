-- A player's avatar is a pet's id from `data/pets.json`, no longer an index into the chat
-- heads. The old values name faces that are gone, so they are cleared: null is "never
-- chosen", and the client draws that player a pet derived from their id.
--
-- The set of valid ids is the manifest's, which grows without a migration, so the server
-- checks it before it writes the column.
alter table players
    drop constraint players_avatar_check,
    alter column avatar type text using null;

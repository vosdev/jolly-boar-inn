-- The door code of a room created "invite link only"; null lets anyone with the code in.
-- A column rather than a setting, because settings reach every player.
alter table rooms add column invite_key text;

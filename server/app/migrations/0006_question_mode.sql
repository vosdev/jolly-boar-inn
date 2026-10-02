-- A question's round is no longer its type. `type` stays "how is this answered";
-- `mode` is "what is this round" -- the pool it was drawn from, the round segments.py
-- groups it into, the mode its splash introduces. Phase 2 puts five modes on the one
-- `multiple_choice` type, so from here on neither can be derived from the other.
--
-- The backfill is exact rather than a best guess: every room created before this plays
-- `more_less` only, and there the mode id and the type id are the same string.
--
-- Added nullable, filled, then made `not null`, rather than given a default: a default
-- would let a later insert that forgot the column succeed as the wrong round.
alter table questions add column mode text;
update questions set mode = type;
alter table questions alter column mode set not null;

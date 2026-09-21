-- T21: a room's own questions stop being a round and become random events -- one question
-- asked inside a round it does not belong to, by an NPC who turns up for it and leaves.
--
-- `questions.random_event` is that NPC's id (app/random_events.py), and null for every
-- question nobody is interrupting. Nullable with no default, because null is the honest
-- value for every row that exists: none of them was placed as an event.
--
-- `rooms.settings` loses `order`, which said where the room's own questions went, and gains
-- `random_events` (may the packs interrupt too?) and `random_event_seconds` (how long the NPC
-- holds the floor). A room created before this keeps its custom round exactly as it is:
-- those rows carry their positions and their `round` already, and selection never runs
-- twice, so `order` has nothing left to decide for it and can go without a look at what it
-- said. `random_events` is false for such a room because it is true: no pack question was
-- placed in it as an event, and none ever will be.
alter table questions add column random_event text;

update rooms
set settings = (settings - 'order')
        || jsonb_build_object('random_events', false, 'random_event_seconds', 2)
where not settings ? 'random_events';

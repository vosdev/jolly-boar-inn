-- The pack content ids a room has shown in its earlier games, so a rematch draws others
-- while the pool allows. Those games' question rows are deleted when the rematch starts.
alter table rooms add column played_question_ids text[] not null default '{}';

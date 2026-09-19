-- Per-mode rounds: a room plays one round per game mode it was created with, and each
-- mode carries its own question count and question length.
--
-- `rooms.settings` loses `question_seconds`, `question_count` and `questions_per_round`,
-- and its `modes` stops being a list of names and becomes a list of
-- `{mode, questions, seconds}`. A new `mode_order` says whether the rounds play in the
-- order they are listed or in a shuffled one; a room that predates this had them dealt
-- out in a shuffled order, but its questions are already stored in the order they will
-- play, so `listed` is the honest answer for it: there is nothing left to shuffle.
--
-- Rooms created before this keep playing. Their rounds are in `questions.round` and
-- their questions in `questions`, so only the timing has to survive, and the old global
-- numbers become every mode's numbers.
update rooms
set settings =
        (settings - 'question_seconds' - 'question_count' - 'questions_per_round')
        || jsonb_build_object(
               'mode_order', 'listed',
               'modes', coalesce(
                   (select jsonb_agg(jsonb_build_object(
                               'mode', old.mode,
                               'questions', coalesce((settings ->> 'questions_per_round')::int, 5),
                               'seconds', coalesce((settings ->> 'question_seconds')::int, 30)))
                    from jsonb_array_elements_text(settings -> 'modes') as old (mode)),
                   settings -> 'modes')
           )
where jsonb_typeof(settings -> 'modes') = 'array'
  and (settings ? 'question_seconds' or settings ? 'question_count'
       or settings ? 'questions_per_round');

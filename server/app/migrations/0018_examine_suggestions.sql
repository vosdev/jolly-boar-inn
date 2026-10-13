-- An examine suggestion is a Guess the Examine question now, written in Create's editor. A
-- stored one becomes the question it described, the right name first; one from before it
-- carried wrong names keeps only that name, to be filled in when the operator edits it.
update suggestions
set kind = 'question',
    content = jsonb_build_object(
        'type', 'multiple_choice',
        'mode', 'guess_examine',
        'wiki', content->'wiki',
        'payload', jsonb_build_object(
            'prompt', content->'prompt',
            'options', jsonb_build_array(content->'name') || coalesce(content->'decoys', '[]'),
            'answer_index', 0
        )
    )
where kind = 'examine';

alter table suggestions drop constraint suggestions_kind_check;
alter table suggestions add constraint suggestions_kind_check check (kind in ('question', 'item'));

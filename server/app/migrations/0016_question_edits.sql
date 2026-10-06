-- The operator's pending edits and deletes of pack questions (app/question_edits.py). The
-- packs live in git, so nothing here plays: a change leaves in an export for
-- `make edit-packs` and its row is deleted once that is applied. Keyed by the question's id
-- in the packs as they are, so a second edit of one question replaces the first.
create table question_edits (
    question_id text primary key,
    mode        text not null,
    action      text not null check (action in ('edit', 'delete')),
    -- The question as it will be, its id recomputed; null for a delete.
    question    jsonb,
    -- The question as the packs hold it, so the change stays readable once it has left them.
    before      jsonb not null,
    updated_at  timestamptz not null default now(),
    exported_at timestamptz,
    check ((action = 'edit') = (question is not null))
);

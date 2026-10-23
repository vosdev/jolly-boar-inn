-- How players do on each hand-written pack question across games, keyed by its content id.
-- No foreign key to rooms, so cleanup deleting a room leaves what its closes added.
create table question_stats (
    question_id text primary key,
    mode        text not null,
    answers     integer not null,
    credit_sum  double precision not null,
    correct     integer not null,
    unanswered  integer not null,
    games       integer not null
);

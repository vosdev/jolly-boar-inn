-- One anonymous row per counted answer, to tune scoring with. Rows rather than counts, so a
-- later question can cut them again. No player, room or question id, and no foreign key, so
-- cleanup deleting a room leaves its rows.
create table answer_timings (
    type       text not null,
    mode       text not null,
    scoring    text not null,
    pace       text not null,
    items      smallint not null,
    seconds    smallint not null,
    elapsed_ms integer not null,
    credit     real not null,
    team       boolean not null,
    played_on  date not null
);

create index answer_timings_type_mode_idx on answer_timings (type, mode);

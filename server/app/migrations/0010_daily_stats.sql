-- Counters per day, keyed by mode where that matters (app/stats.py). Nothing here may
-- identify anyone: no IP, name, room code or player id (tests/test_stats.py pins the
-- columns). No foreign key to rooms, so cleanup deleting a room leaves its counts.
create table daily_stats (
    day    date not null,
    metric text not null,
    key    text not null default '',
    count  integer not null,
    primary key (day, metric, key)
);

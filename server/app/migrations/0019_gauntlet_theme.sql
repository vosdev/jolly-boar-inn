-- The Prifddinas theme became the Gauntlet, so the days counted under its old name count
-- under the new one. A day that somehow has both keeps their sum.
insert into daily_stats (day, metric, key, count)
select day, metric, 'gauntlet', count
from daily_stats
where metric = 'themes' and key = 'prifddinas'
on conflict (day, metric, key) do update set count = daily_stats.count + excluded.count;

delete from daily_stats where metric = 'themes' and key = 'prifddinas';

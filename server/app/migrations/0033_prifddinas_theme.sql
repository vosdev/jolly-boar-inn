-- Prifddinas replaced both Gauntlets, so the days counted under either count under it. A day
-- that has more than one of the three keeps their sum.
insert into daily_stats (day, metric, key, count)
select day, metric, 'prifddinas', sum(count)
from daily_stats
where metric = 'themes' and key in ('gauntlet', 'corrupted_gauntlet')
group by day, metric
on conflict (day, metric, key) do update set count = daily_stats.count + excluded.count;

delete from daily_stats where metric = 'themes' and key in ('gauntlet', 'corrupted_gauntlet');

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActivities,
  fetchDaily,
  fetchHr,
  fetchHrDates,
  fetchHrLatest,
  fetchSleep,
  type SleepLog,
} from "../api";
import { formatHours, formatNumber, latestByDate } from "../format";
import {
  Card,
  ChartCard,
  EmptyState,
  ErrorState,
  RangeSelector,
  Spinner,
} from "../components/ui";
import {
  IntradayHrChart,
  RestingHrChart,
  SleepChart,
  StepsChart,
  type DailyRow,
  type HrHourRow,
} from "../components/Charts";

const RANGES = [7, 30, 90] as const;

export default function DashboardPage() {
  const [days, setDays] = useState<number>(30);

  const daily = useQuery({
    queryKey: ["daily", days],
    queryFn: () => fetchDaily(days),
  });
  const sleep = useQuery({
    queryKey: ["sleep", days],
    queryFn: () => fetchSleep(days),
  });
  const hrDates = useQuery({
    queryKey: ["hrDates", days],
    queryFn: () => fetchHrDates(days),
  });

  const dailyRows = useMemo<DailyRow[]>(
    () =>
      (daily.data ?? []).map((r) => ({
        date: r.date,
        resting_hr: r.resting_hr,
        steps: r.steps,
        sleep_hours: r.sleep_minutes != null ? r.sleep_minutes / 60 : null,
        sleep_efficiency: r.sleep_efficiency,
      })),
    [daily.data]
  );

  const sleepByDate = useMemo(() => {
    const map = new Map<string, SleepLog>();
    for (const row of sleep.data ?? []) {
      const existing = map.get(row.date);
      if (!existing || (row.minutes_asleep ?? 0) > (existing.minutes_asleep ?? 0)) {
        map.set(row.date, row);
      }
    }
    return map;
  }, [sleep.data]);

  const chartRows = useMemo(
    () =>
      dailyRows.map((r) => {
        const sleepRow = sleepByDate.get(r.date);
        return {
          ...r,
          sleep_hours: sleepRow?.minutes_asleep != null ? sleepRow.minutes_asleep / 60 : r.sleep_hours,
          sleep_efficiency: sleepRow?.efficiency ?? r.sleep_efficiency,
        };
      }),
    [dailyRows, sleepByDate]
  );

  const latestDaily = latestByDate(daily.data ?? []);
  const latestSleep = latestByDate(sleep.data ?? []);

  const [hrDate, setHrDate] = useState<string | null>(null);
  const hrLatest = useQuery({
    queryKey: ["hrLatest"],
    queryFn: fetchHrLatest,
    staleTime: 300_000,
  });
  const activeHrDate = hrDate ?? hrLatest.data?.date ?? null;
  const hrRows = useQuery({
    queryKey: ["hr", activeHrDate],
    queryFn: () => fetchHr(activeHrDate!),
    enabled: activeHrDate != null,
  });
  const hrHourRows = useMemo<HrHourRow[]>(
    () =>
      (hrRows.data ?? []).map((r) => ({
        label: `${String(r.hour).padStart(2, "0")}:00`,
        hr_avg: r.hr_avg,
        hr_min: r.hr_min,
        hr_max: r.hr_max,
      })),
    [hrRows.data]
  );

  const activities = useQuery({
    queryKey: ["activities", days],
    queryFn: () => fetchActivities(days),
  });

  const hasDaily = chartRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Overview</h2>
        <RangeSelector days={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card
          title="Resting HR"
          value={latestDaily?.resting_hr != null ? `${Math.round(latestDaily.resting_hr)} bpm` : "—"}
          sub={latestDaily ? latestDaily.date : ""}
          accent="text-rose-300"
        />
        <Card
          title="Steps"
          value={formatNumber(latestDaily?.steps)}
          sub={latestDaily ? latestDaily.date : ""}
          accent="text-sky-300"
        />
        <Card
          title="Sleep"
          value={formatHours(latestSleep?.minutes_asleep ?? latestDaily?.sleep_minutes)}
          sub={
            latestSleep?.efficiency != null
              ? `${Math.round(latestSleep.efficiency)}% efficient · ${latestSleep.date}`
              : latestSleep
                ? latestSleep.date
                : ""
          }
          accent="text-indigo-300"
        />
        <Card
          title="Active minutes"
          value={formatNumber(latestDaily?.active_minutes)}
          sub={latestDaily ? latestDaily.date : ""}
          accent="text-emerald-300"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Resting heart rate">
          {daily.isLoading ? (
            <Spinner />
          ) : daily.isError ? (
            <ErrorState message={`Failed to load metrics: ${(daily.error as Error).message}`} />
          ) : !hasDaily ? (
            <EmptyState message="No synced data yet — wait for the first sync to finish." />
          ) : (
            <RestingHrChart data={chartRows} />
          )}
        </ChartCard>

        <ChartCard title="Steps">
          {daily.isLoading ? (
            <Spinner />
          ) : daily.isError ? (
            <ErrorState message={`Failed to load metrics: ${(daily.error as Error).message}`} />
          ) : !hasDaily ? (
            <EmptyState message="No synced data yet — wait for the first sync to finish." />
          ) : (
            <StepsChart data={chartRows} />
          )}
        </ChartCard>

        <ChartCard title="Sleep duration & efficiency">
          {sleep.isLoading ? (
            <Spinner />
          ) : sleep.isError ? (
            <ErrorState message={`Failed to load sleep: ${(sleep.error as Error).message}`} />
          ) : chartRows.every((r) => r.sleep_hours == null) ? (
            <EmptyState message="No sleep sessions in this range." />
          ) : (
            <SleepChart data={chartRows} />
          )}
        </ChartCard>

        <ChartCard
          title="Intraday heart rate"
          actions={
            (hrDates.data?.length ?? 0) > 0 ? (
              <select
                value={activeHrDate ?? ""}
                onChange={(e) => setHrDate(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              >
                {hrDates.data!.slice(0, 90).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          {hrRows.isLoading ? (
            <Spinner />
          ) : hrRows.isError ? (
            <ErrorState message={`Failed to load HR: ${(hrRows.error as Error).message}`} />
          ) : hrHourRows.length === 0 ? (
            <EmptyState message="No intraday HR data available yet." />
          ) : (
            <IntradayHrChart data={hrHourRows} />
          )}
        </ChartCard>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Recent workouts</h2>
        {activities.isLoading ? (
          <Spinner />
        ) : activities.isError ? (
          <ErrorState message={`Failed to load workouts: ${(activities.error as Error).message}`} />
        ) : (activities.data?.length ?? 0) === 0 ? (
          <EmptyState message="No workouts in this range." />
        ) : (
          <ul className="divide-y divide-slate-800">
            {activities.data!.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-200">{a.type ?? "Workout"}</span>
                <span className="text-slate-500">{a.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

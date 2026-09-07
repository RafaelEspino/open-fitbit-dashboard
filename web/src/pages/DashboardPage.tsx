import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Footprints,
  HeartPulse,
  Moon,
  type LucideIcon,
} from "lucide-react";
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
import { StatCard, StatSkeleton } from "../components/StatCard";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IntradayHrChart,
  RestingHrChart,
  SleepChart,
  StepsChart,
  type DailyRow,
  type HrHourRow,
} from "@/components/Charts";

export default function DashboardPage() {
  const [days, setDays] = useState<number>(30);

  const daily = useQuery({ queryKey: ["daily", days], queryFn: () => fetchDaily(days) });
  const sleep = useQuery({ queryKey: ["sleep", days], queryFn: () => fetchSleep(days) });
  const hrDates = useQuery({ queryKey: ["hrDates", days], queryFn: () => fetchHrDates(days) });
  const activities = useQuery({ queryKey: ["activities", days], queryFn: () => fetchActivities(days) });

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

  const chartRows = useMemo<DailyRow[]>(() => {
    const base = new Map<string, DailyRow>();
    for (const r of daily.data ?? []) {
      base.set(r.date, {
        date: r.date,
        resting_hr: r.resting_hr,
        steps: r.steps,
        sleep_hours: r.sleep_minutes != null ? r.sleep_minutes / 60 : null,
        sleep_efficiency: r.sleep_efficiency,
      });
    }
    for (const [date, s] of sleepByDate) {
      const row = base.get(date) ?? {
        date,
        resting_hr: null,
        steps: null,
        sleep_hours: null,
        sleep_efficiency: null,
      };
      base.set(date, {
        ...row,
        sleep_hours: s.minutes_asleep != null ? s.minutes_asleep / 60 : row.sleep_hours,
        sleep_efficiency: s.efficiency ?? row.sleep_efficiency,
      });
    }
    return [...base.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [daily.data, sleepByDate]);

  const latestDaily = latestByDate(daily.data ?? []);
  const latestSleep = latestByDate(sleep.data ?? []);
  const hasDaily = chartRows.length > 0;

  const [hrDate, setHrDate] = useState<string | null>(null);
  const hrLatest = useQuery({ queryKey: ["hrLatest"], queryFn: fetchHrLatest, staleTime: 300_000 });
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {daily.isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={HeartPulse as LucideIcon}
              title="Resting HR"
              value={latestDaily?.resting_hr != null ? `${Math.round(latestDaily.resting_hr)} bpm` : "—"}
              sub={latestDaily ? latestDaily.date : undefined}
              iconClassName="text-red-400"
            />
            <StatCard
              icon={Footprints as LucideIcon}
              title="Steps"
              value={formatNumber(latestDaily?.steps)}
              sub={latestDaily ? latestDaily.date : undefined}
              iconClassName="text-blue-400"
            />
            <StatCard
              icon={Moon as LucideIcon}
              title="Sleep"
              value={formatHours(latestSleep?.minutes_asleep ?? latestDaily?.sleep_minutes)}
              sub={
                latestSleep?.efficiency != null
                  ? `${Math.round(latestSleep.efficiency)}% efficient · ${latestSleep.date}`
                  : latestSleep
                    ? latestSleep.date
                    : undefined
              }
              iconClassName="text-violet-400"
            />
            <StatCard
              icon={Activity as LucideIcon}
              title="Active minutes"
              value={formatNumber(latestDaily?.active_minutes)}
              sub={latestDaily ? latestDaily.date : undefined}
              iconClassName="text-emerald-400"
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricCard title="Resting heart rate">
          <ChartState
            isLoading={daily.isLoading}
            error={daily.isError ? (daily.error as Error).message : null}
            isEmpty={!hasDaily}
            emptyMessage="No synced data yet — wait for the first sync to finish."
          >
            <RestingHrChart data={chartRows} />
          </ChartState>
        </MetricCard>

        <MetricCard title="Steps">
          <ChartState
            isLoading={daily.isLoading}
            error={daily.isError ? (daily.error as Error).message : null}
            isEmpty={!hasDaily}
            emptyMessage="No synced data yet — wait for the first sync to finish."
          >
            <StepsChart data={chartRows} />
          </ChartState>
        </MetricCard>

        <MetricCard title="Sleep duration & efficiency">
          <ChartState
            isLoading={sleep.isLoading}
            error={sleep.isError ? (sleep.error as Error).message : null}
            isEmpty={chartRows.every((r) => r.sleep_hours == null)}
            emptyMessage="No sleep sessions in this range."
          >
            <SleepChart data={chartRows} />
          </ChartState>
        </MetricCard>

        <Card>
          <CardHeader>
            <CardTitle>Intraday heart rate</CardTitle>
            {(hrDates.data?.length ?? 0) > 0 ? (
              <CardAction>
                <Select
                  value={activeHrDate ?? undefined}
                  onValueChange={(v) => setHrDate(String(v))}
                >
                  <SelectTrigger size="sm" className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hrDates.data!.slice(0, 90).map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <ChartState
              isLoading={hrRows.isLoading}
              error={hrRows.isError ? (hrRows.error as Error).message : null}
              isEmpty={hrHourRows.length === 0}
              emptyMessage="No intraday HR data available yet."
            >
              <IntradayHrChart data={hrHourRows} />
            </ChartState>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent workouts</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.isLoading ? (
            <div className="space-y-2">
              <div className="h-5 rounded bg-muted/60" />
              <div className="h-5 w-2/3 rounded bg-muted/60" />
            </div>
          ) : activities.isError ? (
            <EmptyMessage className="text-destructive">
              Failed to load workouts: {(activities.error as Error).message}
            </EmptyMessage>
          ) : (activities.data?.length ?? 0) === 0 ? (
            <EmptyMessage>No workouts in this range.</EmptyMessage>
          ) : (
            <ul className="divide-y">
              {activities.data!.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{a.type ?? "Workout"}</span>
                  <span className="text-muted-foreground">{a.date}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyMessage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-[220px] items-center justify-center text-sm text-muted-foreground ${className ?? ""}`}>
      {children}
    </div>
  );
}

function ChartState({
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  children,
}: {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  if (isLoading) return <div className="h-[220px] rounded-lg bg-muted/40" />;
  if (error) return <EmptyMessage className="text-destructive">{error}</EmptyMessage>;
  if (isEmpty) return <EmptyMessage>{emptyMessage}</EmptyMessage>;
  return children;
}

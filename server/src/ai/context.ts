import type { AppDatabase } from "../db.js";

export interface MetricContext {
  rangeDays: number;
  daily: {
    date: string;
    resting_hr?: number;
    steps?: number;
    calories?: number;
    active_minutes?: number;
    sleep_minutes?: number;
    sleep_efficiency?: number;
  }[];
  sleepStages: { date: string; deep?: number; rem?: number; light?: number; awake?: number }[];
  workouts: { date: string; type?: string }[];
}

export function buildMetricContext(db: AppDatabase, days: number): MetricContext {
  const daily = (
    db
      .prepare(
        `SELECT date, resting_hr, steps, calories, active_minutes, sleep_minutes, sleep_efficiency
         FROM daily_metrics WHERE date >= date('now', 'localtime', ?) ORDER BY date ASC`
      )
      .all(`-${days} days`) as Record<string, unknown>[]
  ).map((r) => stripNulls(r) as MetricContext["daily"][number]);

  const sleepStages = (
    db
      .prepare(
        `SELECT date, deep_minutes, rem_minutes, light_minutes, awake_minutes FROM sleep_logs
         WHERE date >= date('now', 'localtime', ?) ORDER BY date ASC`
      )
      .all(`-${days} days`) as Record<string, unknown>[]
  ).map((r) => {
    const s = stripNulls(r);
    return {
      date: String(s.date),
      deep: asNumber(s.deep_minutes),
      rem: asNumber(s.rem_minutes),
      light: asNumber(s.light_minutes),
      awake: asNumber(s.awake_minutes),
    };
  });

  const workouts = (
    db
      .prepare(
        `SELECT date, type FROM activities WHERE date >= date('now', 'localtime', ?) ORDER BY date ASC`
      )
      .all(`-${days} days`) as Record<string, unknown>[]
  ).map((r) => ({ date: String(r.date), type: r.type != null ? String(r.type) : undefined }));

  return { rangeDays: days, daily, sleepStages, workouts };
}

export function buildSystemPrompt(context: MetricContext): string {
  return [
    "You are a health and fitness coach analyzing data synced from the user's Fitbit wearable via Google Health.",
    "The user's recent metrics are provided as compact JSON. Units: heart rate in bpm, steps are counts,",
    "calories in kcal, minutes as durations, sleep_efficiency is a percentage. Missing values mean no data was recorded.",
    "Be concise, specific, and reference actual numbers and dates when giving insights or advice.",
    "You are not a doctor; for medical concerns, recommend consulting a healthcare professional.",
  ].join(" ");
}

export function buildContextUserMessage(context: MetricContext): string {
  return `Here is my health data from the last ${context.rangeDays} days:\n${JSON.stringify(context)}`;
}

export function buildReportPrompt(context: MetricContext, period: "daily" | "weekly"): string {
  if (period === "daily") {
    return [
      "Analyze my most recent day of health data and produce a daily check-in report.",
      "Respond in markdown with exactly these sections:",
      "## Summary — 2-3 sentence overview of the day",
      "## Metrics — bullet list of the day's key numbers",
      "## Insights — 2-3 bullets on what stands out compared to my recent trends",
      "## Recommendations — 3-5 actionable coaching bullets for tomorrow",
      "",
      `My recent data (last ${context.rangeDays} days):\n${JSON.stringify(context)}`,
    ].join("\n");
  }
  return [
    "Analyze my last week of health data and produce a weekly analysis report.",
    "Respond in markdown with exactly these sections:",
    "## Summary — 3-4 sentence overview of the week",
    "## Trends — bullets describing week-over-week trends (resting HR, sleep, activity)",
    "## Anomalies — bullets for anything unusual (spikes, gaps, inconsistent sleep)",
    "## Recommendations — 3-5 actionable coaching bullets for next week",
    "",
    `My recent data (last ${context.rangeDays} days):\n${JSON.stringify(context)}`,
  ].join("\n");
}

function stripNulls(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

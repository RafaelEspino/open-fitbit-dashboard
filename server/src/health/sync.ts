import type { AppDatabase } from "../db.js";
import { getSetting, setSetting } from "../db.js";
import type { Config } from "../config.js";
import type { HealthClient } from "./client.js";
import {
  addDays,
  civilDateToStr,
  civilDateTime,
  dateChunks,
  systemTimeZone,
  todayLocal,
  utcToLocalDateHour,
  zonedMidnightToUtc,
} from "../util/dates.js";

export interface DateRange {
  start: string;
  end: string;
}

export interface SyncSummary {
  metricsRows: number;
  restingHrRows: number;
  hrRows: number;
  sleepRows: number;
  exerciseRows: number;
}

type MetricColumn =
  | "resting_hr"
  | "steps"
  | "calories"
  | "active_minutes"
  | "floors"
  | "sleep_minutes"
  | "sleep_efficiency";

const WEARABLES = "users/me/dataSourceFamilies/google-wearables";
const ROLLUP_MAX_DAYS = 14;
const SLEEP_CHUNK_DAYS = 30;

const num = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export class SyncService {
  private warnedShapes = new Set<string>();

  constructor(private db: AppDatabase, private config: Config, private client: HealthClient) {}

  timeZone(): string {
    const stored = getSetting(this.db, "timezone");
    if (stored) return stored;
    const tz = systemTimeZone();
    setSetting(this.db, "timezone", tz);
    return tz;
  }

  async syncRecent(days: number): Promise<SyncSummary> {
    const today = todayLocal(this.timeZone());
    return this.syncAll({ start: addDays(today, -days), end: addDays(today, 1) });
  }

  async syncAll(range: DateRange): Promise<SyncSummary> {
    const summary: SyncSummary = {
      metricsRows: 0,
      restingHrRows: 0,
      hrRows: 0,
      sleepRows: 0,
      exerciseRows: 0,
    };
    summary.metricsRows = await this.syncDailyMetrics(range);
    summary.restingHrRows = await this.syncRestingHeartRate();
    summary.hrRows = await this.syncHourlyHr(range);
    summary.sleepRows = await this.syncSleep(range);
    summary.exerciseRows = await this.syncExercises();
    setSetting(this.db, "last_sync_at", new Date().toISOString());
    return summary;
  }

  async syncDailyMetrics(range: DateRange): Promise<number> {
    const types: { dataType: string; column: MetricColumn; extract: (point: any) => number | null }[] = [
      { dataType: "steps", column: "steps", extract: (p) => num(p?.steps?.countSum) },
      { dataType: "floors", column: "floors", extract: (p) => num(p?.floors?.countSum) },
      { dataType: "total-calories", column: "calories", extract: (p) => num(p?.totalCalories?.kcalSum) },
      {
        dataType: "active-minutes",
        column: "active_minutes",
        extract: (p) => {
          const levels = p?.activeMinutes?.activeMinutesRollupByActivityLevel;
          if (!Array.isArray(levels) || levels.length === 0) return null;
          let sum = 0;
          for (const level of levels) {
            const minutes = num(level?.activeMinutesSum);
            if (minutes == null) return null;
            sum += minutes;
          }
          return sum;
        },
      },
    ];
    let rows = 0;
    const chunks = dateChunks(range.start, range.end, ROLLUP_MAX_DAYS);
    for (const type of types) {
      for (const chunk of chunks) {
        const response = await this.client.post(
          `/users/me/dataTypes/${type.dataType}/dataPoints:dailyRollUp`,
          {
            range: { start: civilDateTime(chunk.start), end: civilDateTime(chunk.end) },
            windowSizeDays: 1,
            dataSourceFamily: WEARABLES,
          }
        );
        for (const point of response?.rollupDataPoints ?? []) {
          const date = civilDateToStr(point?.civilStartTime?.date);
          const value = type.extract(point);
          if (!date || value == null) continue;
          this.upsertMetric(date, type.column, value);
          rows++;
        }
      }
    }
    return rows;
  }

  async syncRestingHeartRate(): Promise<number> {
    let pageToken: string | undefined;
    let rows = 0;
    do {
      const path = new URLSearchParams({ pageSize: "1000" });
      if (pageToken) path.set("pageToken", pageToken);
      const response = await this.client.get(
        `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?${path.toString()}`
      );
      const points: any[] = response?.dataPoints ?? [];
      if (points.length === 0) break;
      let knownInPage = 0;
      for (const point of points) {
        const parsed = this.parseRestingHeartRate(point);
        if (!parsed) continue;
        const existing = this.db
          .prepare("SELECT resting_hr FROM daily_metrics WHERE date = ?")
          .get(parsed.date) as { resting_hr: number | null } | undefined;
        if (existing && existing.resting_hr === parsed.bpm) {
          knownInPage++;
          continue;
        }
        this.upsertMetric(parsed.date, "resting_hr", parsed.bpm);
        rows++;
      }
      if (knownInPage === points.length) break;
      pageToken = response?.nextPageToken || undefined;
    } while (pageToken);
    return rows;
  }

  async syncHourlyHr(range: DateRange): Promise<number> {
    const tz = this.timeZone();
    let rows = 0;
    const chunks = dateChunks(range.start, range.end, ROLLUP_MAX_DAYS);
    for (const chunk of chunks) {
      const response = await this.client.post("/users/me/dataTypes/heart-rate/dataPoints:rollUp", {
        range: {
          startTime: zonedMidnightToUtc(chunk.start, tz),
          endTime: zonedMidnightToUtc(chunk.end, tz),
        },
        windowSize: "3600s",
        dataSourceFamily: WEARABLES,
      });
      for (const point of response?.rollupDataPoints ?? []) {
        const hr = point?.heartRate;
        if (!hr) continue;
        if (hr.beatsPerMinuteAvg == null && hr.beatsPerMinuteMin == null && hr.beatsPerMinuteMax == null) {
          continue;
        }
        const local = utcToLocalDateHour(point.startTime, tz);
        this.db
          .prepare(
            `INSERT INTO hr_hourly (date, hour, hr_min, hr_avg, hr_max) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(date, hour) DO UPDATE SET
               hr_min = COALESCE(excluded.hr_min, hr_hourly.hr_min),
               hr_avg = COALESCE(excluded.hr_avg, hr_hourly.hr_avg),
               hr_max = COALESCE(excluded.hr_max, hr_hourly.hr_max)`
          )
          .run(
            local.date,
            local.hour,
            num(hr.beatsPerMinuteMin),
            num(hr.beatsPerMinuteAvg),
            num(hr.beatsPerMinuteMax)
          );
        rows++;
      }
    }
    return rows;
  }

  async syncSleep(range: DateRange): Promise<number> {
    const tz = this.timeZone();
    let rows = 0;
    const chunks = dateChunks(range.start, range.end, SLEEP_CHUNK_DAYS);
    for (const chunk of chunks) {
      const filter = `sleep.interval.civil_end_time >= "${chunk.start}" AND sleep.interval.civil_end_time < "${chunk.end}"`;
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          dataSourceFamily: WEARABLES,
          pageSize: "25",
          filter,
        });
        if (pageToken) params.set("pageToken", pageToken);
        const response = await this.client.get(
          `/users/me/dataTypes/sleep/dataPoints:reconcile?${params.toString()}`
        );
        const points: any[] = response?.dataPoints ?? [];
        for (const point of points) {
          const stored = this.parseSleep(point, tz);
          if (!stored) continue;
          this.db
            .prepare(
              `INSERT INTO sleep_logs (id, date, start_time, end_time, minutes_asleep, minutes_awake,
                 minutes_in_sleep_period, minutes_to_fall_asleep, efficiency, deep_minutes, rem_minutes,
                 light_minutes, awake_minutes, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time,
                 minutes_asleep = excluded.minutes_asleep, minutes_awake = excluded.minutes_awake,
                 minutes_in_sleep_period = excluded.minutes_in_sleep_period,
                 minutes_to_fall_asleep = excluded.minutes_to_fall_asleep,
                 efficiency = excluded.efficiency, deep_minutes = excluded.deep_minutes,
                 rem_minutes = excluded.rem_minutes, light_minutes = excluded.light_minutes,
                 awake_minutes = excluded.awake_minutes, raw_json = excluded.raw_json`
            )
            .run(
              stored.id,
              stored.date,
              stored.startTime,
              stored.endTime,
              stored.minutesAsleep,
              stored.minutesAwake,
              stored.minutesInSleepPeriod,
              stored.minutesToFallAsleep,
              stored.efficiency,
              stored.deepMinutes,
              stored.remMinutes,
              stored.lightMinutes,
              stored.awakeMinutes,
              stored.rawJson
            );
          if (stored.minutesAsleep != null) {
            this.upsertMetric(stored.date, "sleep_minutes", stored.minutesAsleep);
          }
          if (stored.efficiency != null) {
            this.upsertMetric(stored.date, "sleep_efficiency", stored.efficiency);
          }
          rows++;
        }
        pageToken = response?.nextPageToken || undefined;
      } while (pageToken);
    }
    return rows;
  }

  async syncExercises(): Promise<number> {
    const tz = this.timeZone();
    let pageToken: string | undefined;
    let rows = 0;
    do {
      const params = new URLSearchParams({ pageSize: "25" });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await this.client.get(
        `/users/me/dataTypes/exercise/dataPoints?${params.toString()}`
      );
      const points: any[] = response?.dataPoints ?? [];
      if (points.length === 0) break;
      let knownInPage = 0;
      for (const point of points) {
        const id = point?.name;
        if (!id) continue;
        const exists = this.db.prepare("SELECT 1 FROM activities WHERE id = ?").get(id);
        if (exists) {
          knownInPage++;
          continue;
        }
        const exercise = point?.exercise ?? {};
        const startTime =
          exercise?.interval?.startTime ?? exercise?.sampleTime?.physicalTime ?? null;
        if (!startTime) {
          this.warnShapeOnce("exercise", JSON.stringify(point).slice(0, 300));
          continue;
        }
        const local = utcToLocalDateHour(startTime, tz);
        const endTime = exercise?.interval?.endTime ?? null;
        const type =
          exercise?.type ?? exercise?.activityType ?? exercise?.exerciseType ?? exercise?.sport ?? null;
        this.db
          .prepare(
            `INSERT INTO activities (id, date, start_time, end_time, type, raw_json)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time,
               type = excluded.type, raw_json = excluded.raw_json`
          )
          .run(id, local.date, startTime, endTime, type, JSON.stringify(point));
        rows++;
      }
      if (knownInPage === points.length) break;
      pageToken = response?.nextPageToken || undefined;
    } while (pageToken);
    return rows;
  }

  private parseSleep(point: any, tz: string): {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    minutesAsleep: number | null;
    minutesAwake: number | null;
    minutesInSleepPeriod: number | null;
    minutesToFallAsleep: number | null;
    efficiency: number | null;
    deepMinutes: number | null;
    remMinutes: number | null;
    lightMinutes: number | null;
    awakeMinutes: number | null;
    rawJson: string;
  } | null {
    const id = point?.name ?? point?.dataPointName;
    const sleep = point?.sleep;
    const startTime = sleep?.interval?.startTime;
    const endTime = sleep?.interval?.endTime;
    if (!id || !sleep || !startTime || !endTime) {
      this.warnShapeOnce("sleep", JSON.stringify(point).slice(0, 300));
      return null;
    }
    const summary = sleep?.summary ?? {};
    const minutesAsleep = num(summary.minutesAsleep);
    const minutesAwake = num(summary.minutesAwake);
    const minutesInSleepPeriod = num(summary.minutesInSleepPeriod);
    const minutesToFallAsleep = num(summary.minutesToFallAsleep);
    const stages: Record<string, number | null> = {
      deep: null,
      rem: null,
      light: null,
      awake: null,
    };
    const stageTypes: Record<string, string> = {
      DEEP: "deep",
      REM: "rem",
      LIGHT: "light",
      AWAKE: "awake",
    };
    for (const stage of summary.stagesSummary ?? []) {
      const key = stageTypes[stage?.type ?? ""] ?? String(stage?.type ?? "").toLowerCase();
      if (key in stages) stages[key] = num(stage?.minutes);
    }
    let efficiency: number | null = null;
    if (minutesAsleep != null && minutesInSleepPeriod != null && minutesInSleepPeriod > 0) {
      efficiency = Math.round((minutesAsleep / minutesInSleepPeriod) * 1000) / 10;
    } else if (minutesAsleep != null && minutesAwake != null && minutesAsleep + minutesAwake > 0) {
      efficiency = Math.round((minutesAsleep / (minutesAsleep + minutesAwake)) * 1000) / 10;
    }
    const local = utcToLocalDateHour(endTime, tz);
    return {
      id,
      date: local.date,
      startTime,
      endTime,
      minutesAsleep,
      minutesAwake,
      minutesInSleepPeriod,
      minutesToFallAsleep,
      efficiency,
      deepMinutes: stages.deep,
      remMinutes: stages.rem,
      lightMinutes: stages.light,
      awakeMinutes: stages.awake,
      rawJson: JSON.stringify(point),
    };
  }

  private parseRestingHeartRate(point: any): { date: string; bpm: number } | null {
    const tz = this.timeZone();
    const payload = point?.dailyRestingHeartRate ?? this.findRestingPayload(point);
    if (!payload) {
      this.warnShapeOnce("resting-hr", JSON.stringify(point).slice(0, 300));
      return null;
    }
    const bpm = num(payload.beatsPerMinute ?? payload.averageBeatsPerMinute ?? payload.bpm ?? payload.value);
    const date =
      civilDateToStr(payload.civilDate?.date) ??
      civilDateToStr(payload.sampleTime?.civilTime?.date) ??
      civilDateToStr(payload.interval?.civilStartTime?.date) ??
      civilDateToStr(payload.date) ??
      (payload.sampleTime?.physicalTime
        ? utcToLocalDateHour(payload.sampleTime.physicalTime, tz).date
        : null) ??
      (payload.interval?.startTime ? utcToLocalDateHour(payload.interval.startTime, tz).date : null);
    if (bpm == null || !date) {
      this.warnShapeOnce("resting-hr", JSON.stringify(point).slice(0, 300));
      return null;
    }
    return { date, bpm };
  }

  private findRestingPayload(point: any): any {
    for (const [key, value] of Object.entries(point ?? {})) {
      if (key === "dataSource" || key === "name") continue;
      if (/resting/i.test(key) && value && typeof value === "object") return value;
    }
    return null;
  }

  private upsertMetric(date: string, column: MetricColumn, value: number): void {
    this.db
      .prepare(
        `INSERT INTO daily_metrics (date, ${column}) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET ${column} = COALESCE(excluded.${column}, ${column})`
      )
      .run(date, value);
  }

  private warnShapeOnce(kind: string, sample: string): void {
    if (this.warnedShapes.has(kind)) return;
    this.warnedShapes.add(kind);
    console.warn(`unrecognized ${kind} data point shape, sample: ${sample}`);
  }
}

import { Router, type Request, type Response } from "express";
import type { AppDatabase } from "../db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createMetricsRouter(db: AppDatabase): Router {
  const router = Router();

  router.get("/daily", (req: Request, res: Response) => {
    const days = clampDays(req.query.days);
    const rows = db
      .prepare(
        `SELECT date, resting_hr, steps, calories, active_minutes, floors, sleep_minutes, sleep_efficiency
         FROM daily_metrics
         WHERE date >= date('now', 'localtime', ?)
         ORDER BY date ASC`
      )
      .all(`-${days} days`);
    res.json({ rows });
  });

  router.get("/hr/latest", (_req: Request, res: Response) => {
    const latest = db
      .prepare("SELECT date FROM hr_hourly ORDER BY date DESC, hour DESC LIMIT 1")
      .get() as { date: string } | undefined;
    if (!latest) {
      res.json({ date: null, rows: [] });
      return;
    }
    const rows = db
      .prepare("SELECT date, hour, hr_min, hr_avg, hr_max FROM hr_hourly WHERE date = ? ORDER BY hour ASC")
      .all(latest.date);
    res.json({ date: latest.date, rows });
  });

  router.get("/hr", (req: Request, res: Response) => {
    const date = String(req.query.date ?? "");
    if (!DATE_RE.test(date)) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    const rows = db
      .prepare("SELECT date, hour, hr_min, hr_avg, hr_max FROM hr_hourly WHERE date = ? ORDER BY hour ASC")
      .all(date);
    res.json({ date, rows });
  });

  router.get("/hr/dates", (req: Request, res: Response) => {
    const days = clampDays(req.query.days);
    const rows = db
      .prepare(
        `SELECT DISTINCT date FROM hr_hourly WHERE date >= date('now', 'localtime', ?) ORDER BY date DESC`
      )
      .all(`-${days} days`);
    res.json({ dates: rows.map((r: any) => r.date) });
  });

  router.get("/sleep", (req: Request, res: Response) => {
    const days = clampDays(req.query.days);
    const rows = db
      .prepare(
        `SELECT date, start_time, end_time, minutes_asleep, minutes_awake, minutes_in_sleep_period,
                minutes_to_fall_asleep, efficiency, deep_minutes, rem_minutes, light_minutes, awake_minutes
         FROM sleep_logs
         WHERE date >= date('now', 'localtime', ?)
         ORDER BY date ASC`
      )
      .all(`-${days} days`);
    res.json({ rows });
  });

  router.get("/activities", (req: Request, res: Response) => {
    const days = clampDays(req.query.days);
    const rows = db
      .prepare(
        `SELECT id, date, start_time, end_time, type
         FROM activities
         WHERE date >= date('now', 'localtime', ?)
         ORDER BY date DESC, start_time DESC`
      )
      .all(`-${days} days`);
    res.json({ rows });
  });

  return router;
}

function clampDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

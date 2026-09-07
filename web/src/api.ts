export interface DailyMetric {
  date: string;
  resting_hr: number | null;
  steps: number | null;
  calories: number | null;
  active_minutes: number | null;
  floors: number | null;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
}

export interface HrHourly {
  date: string;
  hour: number;
  hr_min: number | null;
  hr_avg: number | null;
  hr_max: number | null;
}

export interface SleepLog {
  date: string;
  start_time: string;
  end_time: string;
  minutes_asleep: number | null;
  minutes_awake: number | null;
  minutes_in_sleep_period: number | null;
  minutes_to_fall_asleep: number | null;
  efficiency: number | null;
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
}

export interface Activity {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  type: string | null;
}

export interface AuthStatus {
  connected: boolean;
  healthUserId: string | null;
  lastSyncAt: string | null;
  backfill: { running: boolean; done: boolean; cursor: string | null; emptyStreak: number };
}

export interface PairedDevice {
  name: string;
  deviceType: string | null;
  batteryStatus: string | null;
  batteryLevel: number | null;
  lastSyncTime: string | null;
  deviceVersion: string | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDaily(days: number): Promise<DailyMetric[]> {
  const data = await getJson<{ rows: DailyMetric[] }>(`/api/metrics/daily?days=${days}`);
  return data.rows;
}

export async function fetchHrLatest(): Promise<{ date: string | null; rows: HrHourly[] }> {
  return getJson<{ date: string | null; rows: HrHourly[] }>("/api/metrics/hr/latest");
}

export async function fetchHr(date: string): Promise<HrHourly[]> {
  const data = await getJson<{ date: string; rows: HrHourly[] }>(`/api/metrics/hr?date=${date}`);
  return data.rows;
}

export async function fetchHrDates(days: number): Promise<string[]> {
  const data = await getJson<{ dates: string[] }>(`/api/metrics/hr/dates?days=${days}`);
  return data.dates;
}

export async function fetchSleep(days: number): Promise<SleepLog[]> {
  const data = await getJson<{ rows: SleepLog[] }>(`/api/metrics/sleep?days=${days}`);
  return data.rows;
}

export async function fetchActivities(days: number): Promise<Activity[]> {
  const data = await getJson<{ rows: Activity[] }>(`/api/metrics/activities?days=${days}`);
  return data.rows;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  return getJson<AuthStatus>("/api/auth/status");
}

export async function fetchDevices(): Promise<PairedDevice[]> {
  const data = await getJson<{ pairedDevices: PairedDevice[] }>("/api/sync/devices");
  return data.pairedDevices ?? [];
}

export async function postSyncNow(): Promise<void> {
  const res = await fetch("/api/sync/now", { method: "POST" });
  if (!res.ok && res.status !== 202) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
}

export async function postDisconnect(): Promise<void> {
  const res = await fetch("/api/auth/disconnect", { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

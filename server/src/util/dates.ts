export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export interface CivilDateTime {
  date: CivilDate;
  time: { hours: number; minutes: number; seconds: number; nanos: number };
}

export interface DateChunk {
  start: string;
  end: string;
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function todayLocal(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function civilDateTime(dateStr: string): CivilDateTime {
  const [year, month, day] = dateStr.split("-").map(Number);
  return {
    date: { year, month, day },
    time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

export function civilDateToStr(civil: CivilDate | undefined): string | null {
  if (!civil || civil.year == null || civil.month == null || civil.day == null) return null;
  return `${String(civil.year).padStart(4, "0")}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
}

export function dateChunks(startInclusive: string, endExclusive: string, maxDays: number): DateChunk[] {
  const chunks: DateChunk[] = [];
  let cursor = startInclusive;
  while (cursor < endExclusive) {
    let next = addDays(cursor, maxDays);
    if (next > endExclusive) next = endExclusive;
    chunks.push({ start: cursor, end: next });
    cursor = next;
  }
  return chunks;
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - utcMs;
}

export function zonedMidnightToUtc(dateStr: string, timeZone: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess - offset).toISOString();
}

export function utcToLocalDateHour(utcIso: string, timeZone: string): { date: string; hour: number } {
  const ms = Date.parse(utcIso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

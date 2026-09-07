export function formatHours(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

export function latestByDate<T extends { date: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.date > a.date ? b : a));
}

export function shortDate(date: string): string {
  return date.slice(5);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

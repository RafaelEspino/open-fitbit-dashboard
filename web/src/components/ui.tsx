import { useMemo } from "react";

export function Card({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function ChartCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">{message}</div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center px-8 text-center text-sm text-rose-400">
      {message}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex h-[220px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
    </div>
  );
}

export function RangeSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  const options = useMemo(() => [7, 30, 90], []);
  return (
    <div className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            days === option ? "bg-slate-600 text-white" : "text-slate-300 hover:text-slate-100"
          }`}
        >
          {option}d
        </button>
      ))}
    </div>
  );
}

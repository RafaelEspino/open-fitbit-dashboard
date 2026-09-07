import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axisProps = {
  stroke: "#64748b",
  tick: { fill: "#94a3b8", fontSize: 12 },
  tickLine: false,
};

const tooltipStyle = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12,
};

const asNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export interface DailyRow {
  date: string;
  resting_hr: number | null;
  steps: number | null;
  sleep_hours: number | null;
  sleep_efficiency: number | null;
}

export function RestingHrChart({ data }: { data: DailyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
        <YAxis {...axisProps} domain={["dataMin - 4", "dataMax + 4"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(value) => [asNumber(value) != null ? `${Math.round(asNumber(value)!)} bpm` : "—", "Resting HR"]}
        />
        <Line
          type="monotone"
          dataKey="resting_hr"
          stroke="#f87171"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StepsChart({ data }: { data: DailyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
        <YAxis {...axisProps} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(value) => [asNumber(value) != null ? Math.round(asNumber(value)!).toLocaleString() : "—", "Steps"]}
        />
        <Bar dataKey="steps" fill="#38bdf8" radius={[3, 3, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SleepChart({ data }: { data: DailyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
        <YAxis yAxisId="left" {...axisProps} label={{ value: "h", position: "insideLeft", fill: "#94a3b8" }} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          {...axisProps}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(value, name) => {
            const n = asNumber(value);
            const label = String(name);
            return label === "Sleep"
              ? [n != null ? `${Math.floor(n)}h ${Math.round((n % 1) * 60)}m` : "—", label]
              : [n != null ? `${Math.round(n)}%` : "—", label];
          }}
        />
        <Bar yAxisId="left" dataKey="sleep_hours" name="Sleep" fill="#818cf8" radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="sleep_efficiency"
          name="Efficiency"
          stroke="#34d399"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface HrHourRow {
  label: string;
  hr_avg: number | null;
  hr_min: number | null;
  hr_max: number | null;
}

export function IntradayHrChart({ data }: { data: HrHourRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} domain={["dataMin - 6", "dataMax + 6"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(value, name) => {
            const n = asNumber(value);
            return [n != null ? Math.round(n) : "—", `${String(name)} HR`];
          }}
        />
        <Area
          type="monotone"
          dataKey="hr_max"
          name="Max"
          stroke="#fb7185"
          fill="none"
          strokeWidth={1.5}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="hr_avg"
          name="Avg"
          stroke="#f87171"
          fill="#7f1d1d"
          fillOpacity={0.35}
          strokeWidth={2}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="hr_min"
          name="Min"
          stroke="#fca5a5"
          fill="none"
          strokeWidth={1.5}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

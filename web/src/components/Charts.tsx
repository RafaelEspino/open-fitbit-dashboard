import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface DailyRow {
  date: string;
  resting_hr: number | null;
  steps: number | null;
  sleep_hours: number | null;
  sleep_efficiency: number | null;
}

export interface HrHourRow {
  label: string;
  hr_avg: number | null;
  hr_min: number | null;
  hr_max: number | null;
}

const restingHrConfig = {
  resting_hr: { label: "Resting HR", color: "var(--chart-1)" },
} satisfies ChartConfig;

const stepsConfig = {
  steps: { label: "Steps", color: "var(--chart-2)" },
} satisfies ChartConfig;

const sleepConfig = {
  sleep_hours: { label: "Sleep", color: "var(--chart-4)" },
  sleep_efficiency: { label: "Efficiency", color: "var(--chart-3)" },
} satisfies ChartConfig;

const intradayConfig = {
  hr_max: { label: "Max HR", color: "oklch(0.55 0 0)" },
  hr_avg: { label: "Avg HR", color: "var(--chart-1)" },
  hr_min: { label: "Min HR", color: "oklch(0.55 0 0)" },
} satisfies ChartConfig;

export function RestingHrChart({ data }: { data: DailyRow[] }) {
  return (
    <ChartContainer config={restingHrConfig} className="h-[220px] w-full">
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} width={36} domain={["dataMin - 4", "dataMax + 4"]} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Line
          type="monotone"
          dataKey="resting_hr"
          stroke="var(--color-resting_hr)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}

export function StepsChart({ data }: { data: DailyRow[] }) {
  return (
    <ChartContainer config={stepsConfig} className="h-[220px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="steps" fill="var(--color-steps)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

export function SleepChart({ data }: { data: DailyRow[] }) {
  return (
    <ChartContainer config={sleepConfig} className="h-[220px] w-full">
      <ComposedChart accessibilityLayer data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis yAxisId="sleep" tickLine={false} axisLine={false} width={32} />
        <YAxis
          yAxisId="eff"
          orientation="right"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="sleep" dataKey="sleep_hours" fill="var(--color-sleep_hours)" radius={4} />
        <Line
          yAxisId="eff"
          type="monotone"
          dataKey="sleep_efficiency"
          stroke="var(--color-sleep_efficiency)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export function IntradayHrChart({ data }: { data: HrHourRow[] }) {
  return (
    <ChartContainer config={intradayConfig} className="h-[220px] w-full">
      <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          domain={["dataMin - 6", "dataMax + 6"]}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="hr_max"
          stroke="var(--color-hr_max)"
          fill="none"
          strokeWidth={1.5}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="hr_avg"
          stroke="var(--color-hr_avg)"
          fill="var(--color-hr_avg)"
          fillOpacity={0.15}
          strokeWidth={2}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="hr_min"
          stroke="var(--color-hr_min)"
          fill="none"
          strokeWidth={1.5}
          connectNulls
        />
      </AreaChart>
    </ChartContainer>
  );
}

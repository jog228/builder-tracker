"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = {
  stroke: "oklch(0.72 0.03 270)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;
const GRID = <CartesianGrid vertical={false} stroke="oklch(1 0 0 / 6%)" />;
const TOOLTIP = {
  contentStyle: {
    background: "oklch(0.22 0.03 270)",
    border: "1px solid oklch(1 0 0 / 12%)",
    borderRadius: 12,
    fontSize: 12,
  },
  cursor: { fill: "oklch(1 0 0 / 4%)" },
};

export function WeeklyChart({
  data,
}: {
  data: { week: string; updates: number; builders: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="week" {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} />
        <Bar
          dataKey="updates"
          name="Updates"
          fill="var(--chart-1)"
          radius={[6, 6, 0, 0]}
        />
        <Line
          dataKey="builders"
          name="Builders posting"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({
  data,
  x,
  color = "var(--chart-3)",
  height = 200,
}: {
  data: object[];
  x: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} />
        <Bar
          dataKey="messages"
          name="Messages"
          fill={color}
          radius={[5, 5, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttendanceChart({
  data,
}: {
  data: { event: string; attended: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="event" {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} />
        <Bar
          dataKey="attended"
          name="Attended"
          fill="var(--chart-5)"
          radius={[5, 5, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

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
  stroke: "var(--slate)",
  fontSize: 13,
  tickLine: false,
  axisLine: false,
} as const;
const GRID = <CartesianGrid vertical={false} stroke="var(--rule)" />;
const TOOLTIP = {
  contentStyle: {
    background: "var(--paper)",
    border: "2px solid var(--ink)",
    borderRadius: 0,
    color: "var(--ink)",
    fontSize: 14,
  },
  cursor: { fill: "rgb(27 42 65 / 8%)" },
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
          stroke="var(--ink)"
          strokeWidth={2}
        />
        <Line
          dataKey="builders"
          name="Builders posting"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: "var(--chart-2)" }}
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
          stroke="var(--ink)"
          strokeWidth={2}
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
          stroke="var(--ink)"
          strokeWidth={2}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

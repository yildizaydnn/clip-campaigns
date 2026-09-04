"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  views: { label: "Tracked views", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Server delivers the full campaign period — silent days arrive as zeros. */
export function DailyViewsChart({
  data,
}: {
  data: { day: string; views: number }[];
}) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="views" fill="var(--color-views)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}

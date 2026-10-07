import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AttendanceDashboardOverview,
  AttendanceImportRecord,
} from "../api/attendance";
import type { FineSummary } from "../api/fines";

type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
  payload?: Record<string, unknown>;
};

type DashboardTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipEntry[];
  labelFormatter?: (label: string | number) => string;
};

function DashboardTooltip({
  active,
  label,
  payload,
  labelFormatter,
}: DashboardTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="max-w-72 rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {label !== undefined && label !== null ? (
        <p className="mb-1 break-words text-xs font-black">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div
            key={`${String(entry.dataKey ?? entry.name ?? index)}-${index}`}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color ?? "var(--chart-1)" }}
              />
              <span className="truncate">{String(entry.name ?? entry.dataKey ?? "Value")}</span>
            </span>
            <span className="shrink-0 font-black tabular-nums">
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : String(entry.value ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton({ heightClass = "h-72" }: { heightClass?: string }) {
  return <div className={`${heightClass} animate-pulse rounded-2xl bg-muted`} />;
}

function EmptyChart({
  message,
  heightClass = "h-72",
}: {
  message: string;
  heightClass?: string;
}) {
  return (
    <div
      className={`${heightClass} flex items-center justify-center rounded-2xl border border-dashed bg-background/70 p-6 text-center text-sm font-semibold text-muted-foreground`}
    >
      {message}
    </div>
  );
}

function truncateLabel(value: unknown, maxLength = 16) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatChartDate(value: string | number) {
  const text = String(value);
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function AttendanceTrendChart({
  data,
  isLoading,
}: {
  data: AttendanceDashboardOverview["attendanceTrend"];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;
  if (!data.length || data.every((point) => point.count === 0)) {
    return <EmptyChart message="No attendance in the last 14 days." />;
  }

  const total = data.reduce((sum, point) => sum + point.count, 0);

  return (
    <div
      className="h-72 w-full min-w-0"
      role="img"
      aria-label={`Attendance trend for the last 14 days with ${total.toLocaleString()} total records.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="attendanceTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.55} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={<DashboardTooltip labelFormatter={formatChartDate} />}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="Attendance"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fill="url(#attendanceTrendFill)"
            activeDot={{ r: 5, fill: "var(--chart-1)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const fineStatusConfig = [
  { key: "unpaid", label: "Unpaid", color: "var(--chart-unpaid)" },
  { key: "paid", label: "Paid", color: "var(--chart-paid)" },
  { key: "waived", label: "Waived", color: "var(--chart-waived)" },
] as const;

export function FineStatusDonutChart({
  fineSummary,
  isLoading,
}: {
  fineSummary: FineSummary;
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;

  const data = fineStatusConfig.map((status) => ({
    ...status,
    value: fineSummary[status.key],
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!total) return <EmptyChart message="No fine records for this school year." />;

  return (
    <div
      className="relative h-72 w-full min-w-0"
      role="img"
      aria-label={`Fine status breakdown: ${fineSummary.unpaid.toLocaleString()} unpaid, ${fineSummary.paid.toLocaleString()} paid, and ${fineSummary.waived.toLocaleString()} waived.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="45%"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((item) => (
              <Cell key={item.key} fill={item.color} />
            ))}
          </Pie>
          <Tooltip content={<DashboardTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            formatter={(value) => (
              <span className="text-xs font-semibold text-muted-foreground">
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] flex -translate-y-1/2 flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums">{total.toLocaleString()}</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Total
        </span>
      </div>
    </div>
  );
}

export function RecentImportsQualityChart({
  data,
  isLoading,
}: {
  data: AttendanceImportRecord[];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton heightClass="h-40" />;
  if (!data.length) return <EmptyChart message="No recent imports to chart." heightClass="h-40" />;

  const totalValid = data.reduce((sum, item) => sum + item.rows_valid, 0);
  const totalInvalid = data.reduce((sum, item) => sum + item.rows_invalid, 0);

  return (
    <div
      className="h-40 w-full min-w-0"
      role="img"
      aria-label={`Recent import quality with ${totalValid.toLocaleString()} valid rows and ${totalInvalid.toLocaleString()} invalid rows across ${data.length} imports.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="file_name"
            tickFormatter={(value) => truncateLabel(value, 12)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={42}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<DashboardTooltip />} />
          <Bar
            dataKey="rows_valid"
            name="Valid"
            stackId="quality"
            fill="var(--chart-paid)"
            radius={[0, 0, 4, 4]}
          />
          <Bar
            dataKey="rows_invalid"
            name="Invalid"
            stackId="quality"
            fill="var(--chart-unpaid)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AttendanceByCollegeChart({
  data,
  isLoading,
}: {
  data: AttendanceDashboardOverview["attendanceByCollege"];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;
  if (!data.length) return <EmptyChart message="No attendance by college is available." />;

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div
      className="h-72 w-full min-w-0"
      role="img"
      aria-label={`Attendance by college for the top ${data.length} colleges, totaling ${total.toLocaleString()} records.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="college"
            width={150}
            tickFormatter={(value) => truncateLabel(value, 22)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<DashboardTooltip />} />
          <Bar dataKey="count" name="Attendance" fill="var(--chart-2)" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

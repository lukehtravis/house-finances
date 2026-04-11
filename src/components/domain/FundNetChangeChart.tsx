import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "../../lib/utils";

interface Props {
  data: Array<{ monthKey: string; value: number }>;
  label: string;
}

function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const GREEN = "#34d399";
const RED = "#f87171";

export function FundNetChangeChart({ data, label }: Props) {
  const current = data.length > 0 ? data[data.length - 1]!.value : 0;

  const chartData = data.map((d) => ({
    month: formatMonthShort(d.monthKey),
    value: d.value,
  }));

  const values = chartData.map((d) => d.value);
  const yMin = values.length > 0 ? Math.min(...values) : 0;
  const yMax = values.length > 0 ? Math.max(...values) : 0;
  const crossesZero = yMin < 0 && yMax > 0;

  // Percentage from top of chart where y=0 falls, used to position the gradient stop
  const zeroPercent = crossesZero
    ? (yMax / (yMax - yMin)) * 100
    : null;

  const gradientId = `line-gradient-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const solidColor = current >= 0 ? GREEN : RED;
  const strokeColor = crossesZero ? `url(#${gradientId})` : solidColor;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-300">{label}</h4>
        <span
          className={`text-xs font-medium ${current >= 0 ? "text-emerald-400" : "text-red-400"}`}
        >
          {formatCurrency(current)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          {crossesZero && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} />
                <stop offset={`${zeroPercent}%`} stopColor={GREEN} />
                <stop offset={`${zeroPercent}%`} stopColor={RED} />
                <stop offset="100%" stopColor={RED} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#334155"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) =>
              `$${Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}`
            }
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [
              typeof value === "number" ? formatCurrency(value) : String(value),
              "Balance",
            ]}
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#cbd5e1" }}
            itemStyle={{ color: "#cbd5e1" }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const color = payload.value >= 0 ? GREEN : RED;
              return (
                <circle
                  key={`dot-${payload.month}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={color}
                />
              );
            }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

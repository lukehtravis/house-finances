import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { formatCurrency } from "../../lib/utils";

interface Props {
  data: Array<{
    monthKey: string;
    groceryBalance: number;
    houseBalance: number;
    choreBalance: number;
  }>;
}

function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function FundBalanceChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: formatMonthShort(d.monthKey),
    Grocery: d.groceryBalance,
    House: d.houseBalance,
    Chore: d.choreBalance,
    Total: d.groceryBalance + d.houseBalance + d.choreBalance,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={chartData}
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="colorGrocery" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="colorHouse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="colorChore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
          width={52}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [
            typeof value === "number" ? formatCurrency(value) : String(value),
            String(name ?? ""),
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
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          formatter={(value) => (
            <span style={{ color: "#94a3b8" }}>{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="Grocery"
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#colorGrocery)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="House"
          stroke="#60a5fa"
          strokeWidth={2}
          fill="url(#colorHouse)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Chore"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#colorChore)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Total"
          stroke="#e2e8f0"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

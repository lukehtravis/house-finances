import { useMemo, useState } from "react";
import { format } from "date-fns";
import { PageShell } from "../components/ui/PageShell";
import { useCollection, useDocument } from "../hooks/useFirestore";
import type { MonthRecord, Receipt, FundBalances } from "../lib/types";
import { formatMonthKey, formatCurrency, getFirestoreErrorMessage } from "../lib/utils";

interface FundMonthData {
  monthKey: string;
  grocery: {
    duesIn: number;
    receiptsOut: number;
    netChange: number;
  };
  house: {
    duesIn: number;
    receiptsOut: number;
    netChange: number;
  };
  chore: {
    feesIn: number; // Positive feeAdjustments (fees applied)
    creditsOut: number; // Negative feeAdjustments (discounts given)
    netChange: number;
  };
}

export function HouseFinances() {
  const [viewMode, setViewMode] = useState<"all" | "last12">("last12");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const {
    data: months,
    loading: monthsLoading,
    error: monthsError,
  } = useCollection<MonthRecord>("months", {
    orderByField: "monthKey",
    orderDirection: "asc",
  });

  const {
    data: receipts,
    loading: receiptsLoading,
    error: receiptsError,
  } = useCollection<Receipt>("receipts");

  const {
    data: fundBalancesDoc,
    loading: fundBalancesLoading,
    error: fundBalancesError,
  } = useDocument<FundBalances>("fundBalances", "balances");

  // Calculate fund data for each month
  const fundData = useMemo<FundMonthData[]>(() => {
    if (!months || !receipts) return [];

    return months.map((month) => {
      const snapshotHousemateCount = Object.keys(
        month.housemateSnapshots
      ).length;

      // Calculate dues in for each fund
      const groceryDuesIn = month.groceryDues * snapshotHousemateCount;
      const houseDuesIn = month.houseFundDues * snapshotHousemateCount;

      // Calculate receipts out for each fund (filter by monthKey and fund)
      const monthReceipts = receipts.filter(
        (r) => r.monthKey === month.monthKey
      );
      const groceryReceiptsOut = monthReceipts
        .filter((r) => r.fund === "grocery")
        .reduce((sum, r) => sum + r.price, 0);
      const houseReceiptsOut = monthReceipts
        .filter((r) => r.fund === "house")
        .reduce((sum, r) => sum + r.price, 0);

      // Calculate chore fund changes from feeAdjustments
      // Positive feeAdjustment = fee applied (goes into fund)
      // Negative feeAdjustment = credit/discount (comes out of fund)
      const choreFeesIn = Object.values(month.housemateSnapshots)
        .filter((snap) => snap.feeAdjustment > 0)
        .reduce((sum, snap) => sum + snap.feeAdjustment, 0);
      const choreCreditsOut = Math.abs(
        Object.values(month.housemateSnapshots)
          .filter((snap) => snap.feeAdjustment < 0)
          .reduce((sum, snap) => sum + snap.feeAdjustment, 0)
      );
      const choreNetChange = choreFeesIn - choreCreditsOut;

      return {
        monthKey: month.monthKey,
        grocery: {
          duesIn: groceryDuesIn,
          receiptsOut: groceryReceiptsOut,
          netChange: groceryDuesIn - groceryReceiptsOut,
        },
        house: {
          duesIn: houseDuesIn,
          receiptsOut: houseReceiptsOut,
          netChange: houseDuesIn - houseReceiptsOut,
        },
        chore: {
          feesIn: choreFeesIn,
          creditsOut: choreCreditsOut,
          netChange: choreNetChange,
        },
      };
    });
  }, [months, receipts]);

  // Calculate running balances starting from initial balances
  const fundDataWithBalances = useMemo(() => {
    const initialGrocery = fundBalancesDoc?.initialGroceryBalance ?? 0;
    const initialHouse = fundBalancesDoc?.initialHouseBalance ?? 0;
    const initialChore = fundBalancesDoc?.initialChoreBalance ?? 0;

    let groceryBalance = initialGrocery;
    let houseBalance = initialHouse;
    let choreBalance = initialChore;

    return fundData.map((data) => {
      groceryBalance += data.grocery.netChange;
      houseBalance += data.house.netChange;
      choreBalance += data.chore.netChange;

      return {
        ...data,
        groceryBalance,
        houseBalance,
        choreBalance,
      };
    });
  }, [fundData, fundBalancesDoc]);

  // Get current balances (from last month in data, or initial if no months)
  const currentBalances = useMemo(() => {
    if (fundDataWithBalances.length === 0) {
      return {
        grocery: fundBalancesDoc?.initialGroceryBalance ?? 0,
        house: fundBalancesDoc?.initialHouseBalance ?? 0,
        chore: fundBalancesDoc?.initialChoreBalance ?? 0,
      };
    }
    const last = fundDataWithBalances[fundDataWithBalances.length - 1]!;
    return {
      grocery: last.groceryBalance,
      house: last.houseBalance,
      chore: last.choreBalance,
    };
  }, [fundDataWithBalances, fundBalancesDoc]);

  // Get initial balances for display
  const initialBalances = useMemo(() => {
    return {
      grocery: fundBalancesDoc?.initialGroceryBalance ?? 0,
      house: fundBalancesDoc?.initialHouseBalance ?? 0,
      chore: fundBalancesDoc?.initialChoreBalance ?? 0,
    };
  }, [fundBalancesDoc]);

  // Get available years from months
  const availableYears = useMemo(() => {
    if (!months) return [];
    const years = new Set<number>();
    months.forEach((m) => {
      const year = Number(m.monthKey.split("-")[0]);
      years.add(year);
    });
    return Array.from(years).sort();
  }, [months]);

  // Filter data based on view mode
  const filteredData = useMemo(() => {
    if (viewMode === "last12") {
      return fundDataWithBalances.slice(-12);
    } else if (selectedYear !== null) {
      return fundDataWithBalances.filter((d) => {
        const year = Number(d.monthKey.split("-")[0]);
        return year === selectedYear;
      });
    }
    return fundDataWithBalances;
  }, [fundDataWithBalances, viewMode, selectedYear]);

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  if (monthsLoading || receiptsLoading || fundBalancesLoading) {
    return (
      <PageShell title="House Finances">
        <p className="text-slate-400">Loading...</p>
      </PageShell>
    );
  }

  if (monthsError || receiptsError || fundBalancesError) {
    return (
      <PageShell title="House Finances">
        <p className="text-red-400">
          {getFirestoreErrorMessage(monthsError || receiptsError || fundBalancesError)}
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell title="House Finances">
      <div className="space-y-8">
        {/* Current Balances */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Grocery Fund
            </h3>
            <div
              className={`text-4xl font-bold ${
                currentBalances.grocery >= 0
                  ? "text-emerald-300"
                  : "text-red-300"
              }`}
            >
              {formatCurrency(currentBalances.grocery)}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              {initialBalances.grocery > 0 && (
                <p>
                  Starting balance: {formatCurrency(initialBalances.grocery)}
                </p>
              )}
              {fundDataWithBalances.length > 0 && (
                <p>
                  Last updated: {formatMonthKey(
                    fundDataWithBalances[fundDataWithBalances.length - 1]!.monthKey
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              House Fund
            </h3>
            <div
              className={`text-4xl font-bold ${
                currentBalances.house >= 0
                  ? "text-emerald-300"
                  : "text-red-300"
              }`}
            >
              {formatCurrency(currentBalances.house)}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              {initialBalances.house > 0 && (
                <p>
                  Starting balance: {formatCurrency(initialBalances.house)}
                </p>
              )}
              {fundDataWithBalances.length > 0 && (
                <p>
                  Last updated: {formatMonthKey(
                    fundDataWithBalances[fundDataWithBalances.length - 1]!.monthKey
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Chore Fund
            </h3>
            <div
              className={`text-4xl font-bold ${
                currentBalances.chore >= 0
                  ? "text-emerald-300"
                  : "text-red-300"
              }`}
            >
              {formatCurrency(currentBalances.chore)}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              {initialBalances.chore > 0 && (
                <p>
                  Starting balance: {formatCurrency(initialBalances.chore)}
                </p>
              )}
              {fundDataWithBalances.length > 0 && (
                <p>
                  Last updated: {formatMonthKey(
                    fundDataWithBalances[fundDataWithBalances.length - 1]!.monthKey
                  )}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Time Controls */}
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setViewMode("last12");
                setSelectedYear(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "last12"
                  ? "bg-sky-500 text-slate-950"
                  : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              Last 12 Months
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("all");
                setSelectedYear(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "all" && selectedYear === null
                  ? "bg-sky-500 text-slate-950"
                  : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              All Time
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setViewMode("all");
                  setSelectedYear(year);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedYear === year
                    ? "bg-sky-500 text-slate-950"
                    : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </section>

        {/* Monthly Breakdown Table */}
        {filteredData.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-6 text-center text-slate-400">
            No data available for the selected time period.
          </div>
        ) : (
          <section className="space-y-6">
            {/* Grocery Fund Table */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-slate-50">
                Grocery Fund Breakdown
              </h3>
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Dues In</th>
                      <th className="px-3 py-2 text-right">Receipts Out</th>
                      <th className="px-3 py-2 text-right">Net Change</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Running Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((data) => (
                      <tr
                        key={data.monthKey}
                        className="border-t border-slate-800 hover:bg-slate-900/50"
                      >
                        <td className="px-3 py-2 font-medium text-slate-200">
                          {formatMonthKey(data.monthKey)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {formatCurrency(data.grocery.duesIn)}
                        </td>
                        <td className="px-3 py-2 text-right text-red-300">
                          -{formatCurrency(data.grocery.receiptsOut)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.grocery.netChange >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.grocery.netChange)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.groceryBalance >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.groceryBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* House Fund Table */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-slate-50">
                House Fund Breakdown
              </h3>
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Dues In</th>
                      <th className="px-3 py-2 text-right">Receipts Out</th>
                      <th className="px-3 py-2 text-right">Net Change</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Running Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((data) => (
                      <tr
                        key={data.monthKey}
                        className="border-t border-slate-800 hover:bg-slate-900/50"
                      >
                        <td className="px-3 py-2 font-medium text-slate-200">
                          {formatMonthKey(data.monthKey)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {formatCurrency(data.house.duesIn)}
                        </td>
                        <td className="px-3 py-2 text-right text-red-300">
                          -{formatCurrency(data.house.receiptsOut)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.house.netChange >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.house.netChange)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.houseBalance >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.houseBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Chore Fund Table */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-slate-50">
                Chore Fund Breakdown
              </h3>
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Fees In</th>
                      <th className="px-3 py-2 text-right">Credits Out</th>
                      <th className="px-3 py-2 text-right">Net Change</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Running Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((data) => (
                      <tr
                        key={data.monthKey}
                        className="border-t border-slate-800 hover:bg-slate-900/50"
                      >
                        <td className="px-3 py-2 font-medium text-slate-200">
                          {formatMonthKey(data.monthKey)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300">
                          +{formatCurrency(data.chore.feesIn)}
                        </td>
                        <td className="px-3 py-2 text-right text-red-300">
                          -{formatCurrency(data.chore.creditsOut)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.chore.netChange >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.chore.netChange)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            data.choreBalance >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {formatCurrency(data.choreBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

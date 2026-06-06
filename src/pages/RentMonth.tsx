import { useParams, Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { PageShell } from "../components/ui/PageShell";
import { useMonthCalculations } from "../hooks/useMonthCalculations";
import { useCollection } from "../hooks/useFirestore";
import type { MonthRecord, SharedCost } from "../lib/types";
import { formatMonthKey, formatCurrency, getFirestoreErrorMessage } from "../lib/utils";

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return format(date, "yyyy-MM");
}

function getNextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return format(date, "yyyy-MM");
}

export function RentMonth() {
  const { monthKey } = useParams<{ monthKey: string }>();
  const navigate = useNavigate();

  if (!monthKey) {
    return (
      <PageShell title="Invalid Month">
        <p className="text-red-400">Invalid month key provided.</p>
      </PageShell>
    );
  }

  const {
    summary,
    loading,
    error,
    monthRecord,
  } = useMonthCalculations(monthKey);

  const {
    data: allMonths,
    loading: monthsLoading,
  } = useCollection<MonthRecord>("months");

  const {
    data: sharedCosts,
    loading: sharedCostsLoading,
  } = useCollection<SharedCost>("sharedCosts");

  const activeSharedCosts = sharedCosts?.filter((sc) => sc.active) ?? [];

  const previousMonthKey = getPreviousMonthKey(monthKey);
  const nextMonthKey = getNextMonthKey(monthKey);

  // Check if previous/next months exist
  const hasPreviousMonth = allMonths?.some((m) => m.monthKey === previousMonthKey);
  const hasNextMonth = allMonths?.some((m) => m.monthKey === nextMonthKey);


  function getPaidStatusDisplay(paid: "unpaid" | "partial" | "paid"): {
    text: string;
    color: string;
    bgColor: string;
  } {
    switch (paid) {
      case "paid":
        return {
          text: "✓ Paid",
          color: "text-emerald-300",
          bgColor: "bg-emerald-900/30",
        };
      case "partial":
        return {
          text: "~ Partial",
          color: "text-amber-300",
          bgColor: "bg-amber-900/30",
        };
      case "unpaid":
        return {
          text: "✗ Unpaid",
          color: "text-red-300",
          bgColor: "bg-red-900/30",
        };
    }
  }

  if (loading || monthsLoading || sharedCostsLoading) {
    return (
      <PageShell title={`Rent: ${formatMonthKey(monthKey)}`}>
        <p className="text-slate-400">Loading...</p>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title={`Rent: ${formatMonthKey(monthKey)}`}>
        <p className="text-red-400">{getFirestoreErrorMessage(error)}</p>
      </PageShell>
    );
  }

  if (!monthRecord) {
    return (
      <PageShell title={`Rent: ${formatMonthKey(monthKey)}`}>
        <div className="rounded-md bg-amber-900/30 border border-amber-800 px-4 py-3 text-sm text-amber-200">
          This month hasn't been created yet. Go to Admin to create it.
        </div>
        <Link
          to="/rent"
          className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300"
        >
          ← Back to Rent
        </Link>
      </PageShell>
    );
  }

  if (!summary || summary.length === 0) {
    return (
      <PageShell title={`Rent: ${formatMonthKey(monthKey)}`}>
        <p className="text-slate-400">No housemates in this month's snapshot.</p>
        <Link
          to="/rent"
          className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300"
        >
          ← Back to Rent
        </Link>
      </PageShell>
    );
  }

  // Calculate totals
  const totals = {
    roomRent: summary.reduce((sum, item) => sum + item.dues.roomRent, 0),
    utilities: summary.reduce((sum, item) => sum + item.dues.utilities, 0),
    groceryDues: summary.reduce((sum, item) => sum + item.dues.groceryDues, 0),
    houseFundDues: summary.reduce((sum, item) => sum + item.dues.houseFundDues, 0),
    sharedCosts: activeSharedCosts.reduce((acc, sc) => {
      acc[sc.name] = summary.reduce(
        (sum, item) => sum + (item.dues.sharedCosts[sc.name] ?? 0),
        0
      );
      return acc;
    }, {} as Record<string, number>),
    receiptsTotal: summary.reduce((sum, item) => sum + item.dues.receiptsTotal, 0),
    feeAdjustment: summary.reduce((sum, item) => sum + item.dues.feeAdjustment, 0),
    grandTotal: summary.reduce((sum, item) => sum + item.dues.grandTotal, 0),
  };

  // Calculate total utilities
  const totalUtilities = Object.values(monthRecord.utilities).reduce(
    (sum, val) => sum + val,
    0
  );

  return (
    <PageShell title={`Rent: ${formatMonthKey(monthKey)}`}>
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link
            to="/rent"
            className="text-sm font-medium text-slate-300 hover:text-slate-100"
          >
            ← Back to Rent
          </Link>
          <div className="flex items-center gap-2">
            {hasPreviousMonth ? (
              <button
                type="button"
                onClick={() => navigate(`/rent/${previousMonthKey}`)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                ← Previous
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-600 cursor-not-allowed"
              >
                ← Previous
              </button>
            )}
            {hasNextMonth ? (
              <button
                type="button"
                onClick={() => navigate(`/rent/${nextMonthKey}`)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-600 cursor-not-allowed"
              >
                Next →
              </button>
            )}
          </div>
        </div>

        {/* Utilities Breakdown */}
        {totalUtilities > 0 && (
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              Utilities Breakdown
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(monthRecord.utilities).map(([name, amount]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-slate-400">{name}</span>
                  <span className="text-slate-200">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-800 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-slate-300">Total Utilities</span>
              <span className="text-slate-100">{formatCurrency(totalUtilities)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Per Person</span>
              <span>
                {formatCurrency(
                  totalUtilities / Object.keys(monthRecord.housemateSnapshots).length
                )}
              </span>
            </div>
          </div>
        )}

        {/* Main Breakdown Table */}
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Room Rent</th>
                <th className="px-3 py-2 text-right">Utilities</th>
                <th className="px-3 py-2 text-right">Grocery</th>
                <th className="px-3 py-2 text-right">House Fund</th>
                {activeSharedCosts.map((sc) => (
                  <th key={sc.id} className="px-3 py-2 text-right">
                    {sc.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Receipts</th>
                <th className="px-3 py-2 text-right">Chores</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((item) => {
                const status = getPaidStatusDisplay(item.paid);
                return (
                  <tr
                    key={item.housemate.id}
                    className="border-t border-slate-800 hover:bg-slate-900/50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-200">
                      {item.housemate.name}
                      {item.transitionIn && (
                        <span className="ml-2 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-200">
                          Moving in
                        </span>
                      )}
                      {item.transitionOut && (
                        <span className="ml-2 rounded-full bg-amber-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-200">
                          Moving out
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {formatCurrency(item.dues.roomRent)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {formatCurrency(item.dues.utilities)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {formatCurrency(item.dues.groceryDues)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {formatCurrency(item.dues.houseFundDues)}
                    </td>
                    {activeSharedCosts.map((sc) => (
                      <td key={sc.id} className="px-3 py-2 text-right text-slate-300">
                        {formatCurrency(item.dues.sharedCosts[sc.name] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-red-300">
                      -{formatCurrency(item.dues.receiptsTotal)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {item.dues.feeAdjustment !== 0
                        ? formatCurrency(item.dues.feeAdjustment)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-100">
                      {formatCurrency(item.dues.grandTotal)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${status.color} ${status.bgColor}`}
                      >
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-900/80 border-t-2 border-slate-700">
              <tr>
                <td className="px-3 py-2 font-semibold text-slate-200">Totals</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {formatCurrency(totals.roomRent)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {formatCurrency(totals.utilities)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {formatCurrency(totals.groceryDues)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {formatCurrency(totals.houseFundDues)}
                </td>
                {activeSharedCosts.map((sc) => (
                  <td
                    key={sc.id}
                    className="px-3 py-2 text-right font-semibold text-slate-200"
                  >
                    {formatCurrency(totals.sharedCosts[sc.name] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold text-red-300">
                  -{formatCurrency(totals.receiptsTotal)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {totals.feeAdjustment !== 0
                    ? formatCurrency(totals.feeAdjustment)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-bold text-lg text-slate-100">
                  {formatCurrency(totals.grandTotal)}
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile Card View (for smaller screens) */}
        <div className="block sm:hidden space-y-4">
          {summary.map((item) => {
            const status = getPaidStatusDisplay(item.paid);
            return (
              <div
                key={item.housemate.id}
                className="rounded-md border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-200">
                    {item.housemate.name}
                    {item.transitionIn && (
                      <span className="ml-2 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-200">
                        Moving in
                      </span>
                    )}
                    {item.transitionOut && (
                      <span className="ml-2 rounded-full bg-amber-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-200">
                        Moving out
                      </span>
                    )}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.color} ${status.bgColor}`}
                  >
                    {status.text}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Room Rent</span>
                    <span className="text-slate-200">
                      {formatCurrency(item.dues.roomRent)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Utilities</span>
                    <span className="text-slate-200">
                      {formatCurrency(item.dues.utilities)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Grocery Dues</span>
                    <span className="text-slate-200">
                      {formatCurrency(item.dues.groceryDues)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">House Fund Dues</span>
                    <span className="text-slate-200">
                      {formatCurrency(item.dues.houseFundDues)}
                    </span>
                  </div>
                  {activeSharedCosts.map((sc) => (
                    <div key={sc.id} className="flex justify-between">
                      <span className="text-slate-400">{sc.name}</span>
                      <span className="text-slate-200">
                        {formatCurrency(item.dues.sharedCosts[sc.name] ?? 0)}
                      </span>
                    </div>
                  ))}
                  {item.dues.receiptsTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Receipts</span>
                      <span className="text-red-300">
                        -{formatCurrency(item.dues.receiptsTotal)}
                      </span>
                    </div>
                  )}
                  {item.dues.feeAdjustment !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Chores</span>
                      <span className="text-slate-200">
                        {formatCurrency(item.dues.feeAdjustment)}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 border-t border-slate-800 pt-2 flex justify-between font-semibold">
                    <span className="text-slate-300">Total</span>
                    <span className="text-slate-100">
                      {formatCurrency(item.dues.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}

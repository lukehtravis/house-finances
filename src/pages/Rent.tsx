import { Link } from "react-router-dom";
import { format } from "date-fns";
import { PageShell } from "../components/ui/PageShell";
import { useCollection } from "../hooks/useFirestore";
import { useMonthCalculations } from "../hooks/useMonthCalculations";
import type { MonthRecord } from "../lib/types";
import { formatMonthKey, formatCurrency, getFirestoreErrorMessage, isMonthFinalized } from "../lib/utils";

function getCurrentMonthKey(): string {
  const now = new Date();
  return format(now, "yyyy-MM");
}

function getNextMonthKey(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return format(nextMonth, "yyyy-MM");
}

export function Rent() {
  const currentMonthKey = getCurrentMonthKey();
  const nextMonthKey = getNextMonthKey();

  const {
    data: months,
    loading: monthsLoading,
    error: monthsError,
  } = useCollection<MonthRecord>("months", {
    orderBy: "monthKey",
    orderDirection: "desc",
  });

  const {
    summary: currentSummary,
    loading: currentLoading,
    monthRecord: currentMonthRecord,
  } = useMonthCalculations(currentMonthKey);

  const {
    summary: nextSummary,
    loading: nextLoading,
    monthRecord: nextMonthRecord,
  } = useMonthCalculations(nextMonthKey);

  // Get last 12 months (excluding current and next)
  const previousMonths = months
    ?.filter(
      (m) => m.monthKey !== currentMonthKey && m.monthKey !== nextMonthKey
    )
    .slice(0, 12) ?? [];


  function getPaidStatusDisplay(paid: "unpaid" | "partial" | "paid"): {
    text: string;
    color: string;
  } {
    switch (paid) {
      case "paid":
        return { text: "✓ Paid", color: "text-emerald-300" };
      case "partial":
        return { text: "~ Partial", color: "text-amber-300" };
      case "unpaid":
        return { text: "✗ Unpaid", color: "text-red-300" };
    }
  }

  return (
    <PageShell title="Rent">
      <div className="space-y-8">
        {/* Current Month */}
        <section className="rounded-md border border-slate-800 bg-slate-900/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-50">
              Current Month: {formatMonthKey(currentMonthKey)}
            </h2>
            {currentMonthRecord && (
              <Link
                to={`/rent/${currentMonthKey}`}
                className="text-sm font-medium text-sky-400 hover:text-sky-300"
              >
                View Details →
              </Link>
            )}
          </div>

          {currentLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : currentMonthRecord ? (
            currentSummary && currentSummary.length > 0 ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {currentSummary.map((item) => {
                    const status = getPaidStatusDisplay(item.paid);
                    return (
                      <div
                        key={item.housemate.id}
                        className="rounded-md border border-slate-800 bg-slate-900 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-slate-200">
                            {item.housemate.name}
                          </span>
                          <span className={`text-xs font-semibold ${status.color}`}>
                            {status.text}
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-slate-50">
                          {formatCurrency(item.dues.grandTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No housemates in this month's snapshot.
              </p>
            )
          ) : (
            <div className="rounded-md bg-amber-900/30 border border-amber-800 px-4 py-3 text-sm text-amber-200">
              This month hasn't been created yet. Go to Admin to create it.
            </div>
          )}
        </section>

        {/* Next Month */}
        <section className="rounded-md border border-slate-800 bg-slate-900/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-50">
              Next Month: {formatMonthKey(nextMonthKey)}
            </h2>
            {nextMonthRecord && (
              <Link
                to={`/rent/${nextMonthKey}`}
                className="text-sm font-medium text-sky-400 hover:text-sky-300"
              >
                View Details →
              </Link>
            )}
          </div>

          {nextLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : nextMonthRecord ? (
            nextSummary && nextSummary.length > 0 ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {nextSummary.map((item) => {
                    const status = getPaidStatusDisplay(item.paid);
                    return (
                      <div
                        key={item.housemate.id}
                        className="rounded-md border border-slate-800 bg-slate-900 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-slate-200">
                            {item.housemate.name}
                          </span>
                          <span className={`text-xs font-semibold ${status.color}`}>
                            {status.text}
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-slate-50">
                          {formatCurrency(item.dues.grandTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No housemates in this month's snapshot.
              </p>
            )
          ) : (
            <div className="rounded-md bg-slate-800/50 border border-slate-700 px-4 py-3 text-sm text-slate-400">
              Next month hasn't been created yet. Go to Admin to create it.
            </div>
          )}
        </section>

        {/* Previous Months */}
        {previousMonths.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-50">
              Previous Months
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {previousMonths.map((month) => (
                <Link
                  key={month.id}
                  to={`/rent/${month.monthKey}`}
                  className="rounded-md border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">
                      {formatMonthKey(month.monthKey)}
                    </span>
                    {isMonthFinalized(month.monthKey) && (
                      <span className="text-xs text-emerald-300">✓ Finalized</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {monthsLoading && (
          <p className="text-sm text-slate-400">Loading months...</p>
        )}
        {monthsError && (
          <p className="text-sm text-red-400">
            {getFirestoreErrorMessage(monthsError)}
          </p>
        )}
      </div>
    </PageShell>
  );
}

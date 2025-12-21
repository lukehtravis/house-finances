import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { PageShell } from "../components/ui/PageShell";
import { useCollection, useDocument, addDocument } from "../hooks/useFirestore";
import type { Receipt, Housemate, ReceiptFund, MonthRecord } from "../lib/types";

type ReceiptFormState = {
  date: string;
  housemateId: string;
  place: string;
  fund: ReceiptFund;
  price: string;
  description: string;
};

const emptyForm: ReceiptFormState = {
  date: format(new Date(), "yyyy-MM-dd"),
  housemateId: "",
  place: "",
  fund: "grocery",
  price: "",
  description: "",
};

type FilterState = {
  personId: string;
  fund: string;
  monthKey: string;
};

const emptyFilters: FilterState = {
  personId: "",
  fund: "",
  monthKey: "",
};

export function Receipts() {
  const {
    data: receipts,
    loading: receiptsLoading,
    error: receiptsError,
  } = useCollection<Receipt>("receipts", {
    orderByField: "date",
    orderDirection: "desc",
  });

  const {
    data: housemates,
    loading: housematesLoading,
  } = useCollection<Housemate>("housemates", {
    orderByField: "name",
    orderDirection: "asc",
  });

  const activeHousemates = useMemo(
    () => housemates.filter((h) => h.active),
    [housemates]
  );

  function getMonthKeyFromDate(dateString: string): string {
    // Receipts are assigned to the NEXT month (e.g., December receipts → January)
    // because rent is calculated at the beginning of the month, before expenses are known
    const date = new Date(dateString + "T12:00:00");
    const nextMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    nextMonth.setMonth(nextMonth.getMonth() + 1); // Add one month
    return format(nextMonth, "yyyy-MM");
  }

  const [form, setForm] = useState<ReceiptFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);

  // Check if the selected date's month is finalized
  const selectedMonthKey = useMemo(
    () => getMonthKeyFromDate(form.date),
    [form.date]
  );
  const { data: selectedMonthRecord } = useDocument<MonthRecord>(
    "months",
    selectedMonthKey
  );

  // Get unique month keys from receipts for filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    receipts.forEach((r) => months.add(r.monthKey));
    return Array.from(months).sort().reverse();
  }, [receipts]);

  // Filter receipts based on current filters
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (filters.personId && r.housemateId !== filters.personId) return false;
      if (filters.fund && r.fund !== filters.fund) return false;
      if (filters.monthKey && r.monthKey !== filters.monthKey) return false;
      return true;
    });
  }, [receipts, filters]);

  // Calculate total of filtered receipts
  const filteredTotal = useMemo(() => {
    return filteredReceipts.reduce((sum, r) => sum + r.price, 0);
  }, [filteredReceipts]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!form.housemateId) {
      setFormError("Please select a person.");
      return;
    }
    if (!form.place.trim()) {
      setFormError("Place/store is required.");
      return;
    }
    const priceNumber = Number(form.price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setFormError("Price must be a positive number.");
      return;
    }

    // Check if month is already finalized/calculated
    if (selectedMonthRecord) {
      setFormError(
        `Cannot add receipts for ${format(new Date(selectedMonthKey + "-01"), "MMMM yyyy")}. This month has already been calculated and finalized.`
      );
      return;
    }

    const monthKey = selectedMonthKey;

    setSubmitting(true);
    try {
      await addDocument<Omit<Receipt, "id">>("receipts", {
        date: new Date(form.date + "T12:00:00"),
        housemateId: form.housemateId,
        place: form.place.trim(),
        fund: form.fund,
        price: priceNumber,
        description: form.description.trim(),
        monthKey,
      } as Omit<Receipt, "id">);

      setForm({ ...emptyForm, date: format(new Date(), "yyyy-MM-dd") });
      setSuccessMessage("Receipt added successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  function getHousemateName(id: string): string {
    return housemates.find((h) => h.id === id)?.name ?? "Unknown";
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  function formatReceiptDate(date: Date | { seconds: number; nanoseconds: number }): string {
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else {
      dateObj = new Date(date.seconds * 1000);
    }
    return format(dateObj, "MMM d, yyyy");
  }

  return (
    <PageShell title="Receipts">
      <div className="space-y-6">
        {/* Add Receipt Form */}
        <section className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-50">Add Receipt</h2>

          {formError && (
            <div className="mb-3 rounded-md bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-200">
              {formError}
            </div>
          )}

          {successMessage && (
            <div className="mb-3 rounded-md bg-emerald-900/30 border border-emerald-800 px-3 py-2 text-sm text-emerald-200">
              {successMessage}
            </div>
          )}

          {selectedMonthRecord && (
            <div className="mb-3 rounded-md bg-amber-900/30 border border-amber-800 px-3 py-2 text-sm text-amber-200">
              ⚠️ This month ({format(new Date(selectedMonthKey + "-01"), "MMMM yyyy")}) has already been calculated and finalized. You cannot add receipts for this month.
            </div>
          )}

          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-md border-2 border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400 focus:bg-slate-900 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:invert"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Person
                </label>
                <select
                  value={form.housemateId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, housemateId: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  required
                >
                  <option value="">Select person...</option>
                  {activeHousemates.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Place/Store
                </label>
                <input
                  type="text"
                  value={form.place}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, place: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  placeholder="e.g., Whole Foods, Home Depot"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Fund
                </label>
                <select
                  value={form.fund}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fund: e.target.value as ReceiptFund,
                    }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                >
                  <option value="grocery">Grocery Fund</option>
                  <option value="house">House Fund</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Price ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Description (optional)
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                placeholder="Additional notes about this receipt..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !!selectedMonthRecord}
              className="rounded-md bg-sky-500 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Adding..." : "Add Receipt"}
            </button>
          </form>
        </section>

        {/* Receipt History */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-50">Receipt History</h2>

          {/* Filters */}
          <div className="mb-4 grid gap-3 rounded-md border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Filter by Person
              </label>
              <select
                value={filters.personId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, personId: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
              >
                <option value="">All people</option>
                {activeHousemates.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Filter by Fund
              </label>
              <select
                value={filters.fund}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, fund: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
              >
                <option value="">All funds</option>
                <option value="grocery">Grocery Fund</option>
                <option value="house">House Fund</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Filter by Month
              </label>
              <select
                value={filters.monthKey}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, monthKey: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
              >
                <option value="">All months</option>
                {availableMonths.map((month) => (
                  <option key={month} value={month}>
                    {format(new Date(month + "-01"), "MMMM yyyy")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {receiptsLoading || housematesLoading ? (
            <p className="text-sm text-slate-400">Loading receipts…</p>
          ) : receiptsError ? (
            <p className="text-sm text-red-400">
              Error loading receipts: {receiptsError.message}
            </p>
          ) : filteredReceipts.length === 0 ? (
            <p className="text-sm text-slate-400">
              {receipts.length === 0
                ? "No receipts yet. Add one using the form above."
                : "No receipts match the current filters."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Person</th>
                      <th className="px-3 py-2">Place</th>
                      <th className="px-3 py-2">Fund</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReceipts.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-300">
                          {formatReceiptDate(r.date)}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {getHousemateName(r.housemateId)}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{r.place}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.fund === "grocery"
                                ? "bg-emerald-900/60 text-emerald-200"
                                : "bg-blue-900/60 text-blue-200"
                            }`}
                          >
                            {r.fund === "grocery" ? "Grocery" : "House"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-100">
                          {formatCurrency(r.price)}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {r.description || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900/50 border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold text-slate-200">
                        Total:
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-50">
                        {formatCurrency(filteredTotal)}
                      </td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

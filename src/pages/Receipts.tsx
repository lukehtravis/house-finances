import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { PageShell } from "../components/ui/PageShell";
import { useCollection, addDocument } from "../hooks/useFirestore";
import type { Receipt, Housemate, ReceiptFund } from "../lib/types";
import {
  formatDateShort,
  formatMonthKey,
  formatCurrency,
  getFirestoreErrorMessage,
  getCurrentPSTDate,
  getCurrentPSTDateString,
  isMonthFinalized,
} from "../lib/utils";

type ReceiptFormState = {
  housemateId: string;
  place: string;
  fund: ReceiptFund | "";
  price: string;
  description: string;
};

const emptyForm: ReceiptFormState = {
  housemateId: "",
  place: "",
  fund: "",
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

  function getMonthKeyFromDate(dateString: string): string {
    // Receipts are assigned to the NEXT month (e.g., December receipts → January)
    // because rent is calculated at the beginning of the month, before expenses are known
    const date = new Date(dateString + "T12:00:00");
    const nextMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    nextMonth.setMonth(nextMonth.getMonth() + 1); // Add one month
    return format(nextMonth, "yyyy-MM");
  }

  // Housemates eligible to submit a receipt right now. Active housemates
  // always count. Archived housemates count if their lastMonthKey covers
  // the receipt's target month (e.g., May receipts for someone whose final
  // month is June).
  const currentTargetMonthKey = useMemo(
    () => getMonthKeyFromDate(getCurrentPSTDateString()),
    []
  );
  const eligibleHousemates = useMemo(
    () =>
      housemates.filter((h) => {
        if (h.active && !h.archived) return true;
        if (h.archived && h.lastMonthKey) {
          // include if their final month is the current target month or later
          return h.lastMonthKey >= currentTargetMonthKey;
        }
        return false;
      }),
    [housemates, currentTargetMonthKey]
  );

  const [form, setForm] = useState<ReceiptFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const receiptsPerPage = 20;

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

  // Pagination
  const totalPages = Math.ceil(filteredReceipts.length / receiptsPerPage);
  const paginatedReceipts = useMemo(() => {
    const startIndex = (currentPage - 1) * receiptsPerPage;
    return filteredReceipts.slice(startIndex, startIndex + receiptsPerPage);
  }, [filteredReceipts, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [filters]);

  function getHousemateName(housemateId: string): string {
    return housemates.find((h) => h.id === housemateId)?.name ?? "Unknown";
  }

  function formatReceiptDate(date: any): string {
    if (!date) return "—";
    // Handle Firestore Timestamp
    if (date.toDate) {
      return formatDateShort(date.toDate());
    }
    // Handle Date object
    if (date instanceof Date) {
      return formatDateShort(date);
    }
    // Handle string
    return formatDateShort(date);
  }

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
    if (!form.fund) {
      setFormError("Please select a fund.");
      return;
    }
    const priceNumber = Number(form.price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setFormError("Price must be a positive number.");
      return;
    }

    // Get current PST date and calculate target month
    const currentPSTDate = getCurrentPSTDate();
    const currentPSTDateString = getCurrentPSTDateString();
    const monthKey = getMonthKeyFromDate(currentPSTDateString);
    
    setSubmitting(true);
    try {
      // Check if target month (where receipt will be credited) has already passed
      // A month is finalized if the current PST date is past the end of that month
      if (isMonthFinalized(monthKey)) {
        const targetMonthDisplay = formatMonthKey(monthKey);
        const receiptDateDisplay = formatMonthKey(
          format(currentPSTDate, "yyyy-MM")
        );
        setFormError(
          `You're adding a receipt for ${receiptDateDisplay}, which will be credited to ${targetMonthDisplay}. ${targetMonthDisplay} has already ended, so you cannot add this receipt.`
        );
        setSubmitting(false);
        return;
      }

      await addDocument<Omit<Receipt, "id" | "createdAt">>("receipts", {
        date: currentPSTDate as any, // Firestore will convert Date to Timestamp
        housemateId: form.housemateId,
        place: form.place.trim(),
        fund: form.fund as ReceiptFund, // Already validated above
        price: priceNumber,
        description: form.description.trim(),
        monthKey,
      });

      setForm(emptyForm);
      setSuccessMessage("Receipt added successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save receipt.");
    } finally {
      setSubmitting(false);
    }
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

          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  {eligibleHousemates.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.archived ? " (archived)" : ""}
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
                      fund: e.target.value as ReceiptFund | "",
                    }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  required
                >
                  <option value="">Select fund...</option>
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
              disabled={submitting}
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
                {housemates.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.archived ? " (archived)" : ""}
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
                    {formatMonthKey(month)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {receiptsLoading || housematesLoading ? (
            <p className="text-sm text-slate-400">Loading receipts…</p>
          ) : receiptsError ? (
            <p className="text-sm text-red-400">
              {getFirestoreErrorMessage(receiptsError)}
            </p>
          ) : filteredReceipts.length === 0 ? (
            <p className="text-sm text-slate-400">
              {receipts.length === 0
                ? "No receipts yet. Add one using the form above."
                : "No receipts match the current filters."}
            </p>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto rounded-md border border-slate-800">
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
                    {paginatedReceipts.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/50">
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
                        Total ({filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? "s" : ""}):
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-50">
                        {formatCurrency(filteredTotal)}
                      </td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {paginatedReceipts.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-slate-800 bg-slate-900/50 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-slate-200">
                        {getHousemateName(r.housemateId)}
                      </span>
                      <span className="font-semibold text-slate-100">
                        {formatCurrency(r.price)}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Date:</span>
                        <span className="text-slate-300">{formatReceiptDate(r.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Place:</span>
                        <span className="text-slate-300">{r.place}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Fund:</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.fund === "grocery"
                              ? "bg-emerald-900/60 text-emerald-200"
                              : "bg-blue-900/60 text-blue-200"
                          }`}
                        >
                          {r.fund === "grocery" ? "Grocery" : "House"}
                        </span>
                      </div>
                      {r.description && (
                        <div className="flex items-start gap-2">
                          <span className="text-slate-400">Notes:</span>
                          <span className="text-slate-300">{r.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-200">
                      Total ({filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? "s" : ""}):
                    </span>
                    <span className="font-bold text-slate-50">
                      {formatCurrency(filteredTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-slate-400">
                    Showing {((currentPage - 1) * receiptsPerPage) + 1} to{" "}
                    {Math.min(currentPage * receiptsPerPage, filteredReceipts.length)} of{" "}
                    {filteredReceipts.length} receipts
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="flex items-center px-3 py-1.5 text-sm text-slate-300">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

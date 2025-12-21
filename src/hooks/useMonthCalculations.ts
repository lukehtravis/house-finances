import { useMemo } from "react";
import { useCollection, useDocument } from "./useFirestore";
import { calculateMonthSummary, type MonthSummaryItem } from "../lib/calculations";
import type { MonthRecord, Housemate, Receipt, SharedCost } from "../lib/types";

export function useMonthCalculations(monthKey: string) {
  // Fetch month record
  const {
    data: monthRecord,
    loading: monthLoading,
    error: monthError,
  } = useDocument<MonthRecord>("months", monthKey);

  // Fetch all housemates
  const {
    data: housemates,
    loading: housematesLoading,
    error: housematesError,
  } = useCollection<Housemate>("housemates");

  // Fetch all receipts (we'll filter by monthKey in the calculation)
  const {
    data: allReceipts,
    loading: receiptsLoading,
    error: receiptsError,
  } = useCollection<Receipt>("receipts");

  // Fetch all shared costs
  const {
    data: sharedCosts,
    loading: sharedCostsLoading,
    error: sharedCostsError,
  } = useCollection<SharedCost>("sharedCosts");

  // Filter receipts for this month
  const monthReceipts = useMemo(() => {
    if (!allReceipts) return [];
    return allReceipts.filter((r) => r.monthKey === monthKey);
  }, [allReceipts, monthKey]);

  // Calculate summary
  const summary = useMemo<MonthSummaryItem[] | null>(() => {
    if (
      !monthRecord ||
      !housemates ||
      !sharedCosts ||
      monthLoading ||
      housematesLoading ||
      sharedCostsLoading
    ) {
      return null;
    }

    return calculateMonthSummary({
      monthRecord,
      housemates,
      receipts: monthReceipts,
      sharedCosts,
    });
  }, [
    monthRecord,
    housemates,
    monthReceipts,
    sharedCosts,
    monthLoading,
    housematesLoading,
    sharedCostsLoading,
  ]);

  const loading =
    monthLoading || housematesLoading || receiptsLoading || sharedCostsLoading;
  const error = monthError || housematesError || receiptsError || sharedCostsError;

  return {
    summary,
    loading,
    error,
    monthRecord,
  };
}


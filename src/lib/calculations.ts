import type {
  Housemate,
  MonthRecord,
  Receipt,
  SharedCost,
  MonthHousemateSnapshot,
} from "./types";

export interface HousemateDues {
  roomRent: number;
  utilities: number;
  groceryDues: number;
  houseFundDues: number;
  sharedCosts: Record<string, number>; // { [sharedCostName]: amount }
  receiptsTotal: number;
  feeAdjustment: number;
  /**
   * Credit carried forward from prior month's overhang (positive number).
   * Subtracted from grandTotal.
   */
  creditFromPriorMonth: number;
  grandTotal: number;
}

export interface MonthSummaryItem {
  housemate: Housemate;
  dues: HousemateDues;
  paid: "unpaid" | "partial" | "paid";
  transitionOut: boolean;
  transitionIn: boolean;
}

export interface CalculateHousemateDuesParams {
  housemate: Housemate;
  monthRecord: MonthRecord;
  receipts: Receipt[];
  sharedCosts: SharedCost[];
  allHousemates: Housemate[];
}

export interface CalculateMonthSummaryParams {
  monthRecord: MonthRecord;
  housemates: Housemate[];
  receipts: Receipt[];
  sharedCosts: SharedCost[];
}

/**
 * Calculate how much a housemate owes for a specific shared cost.
 */
export function calculateSharedCostForHousemate(
  sharedCost: SharedCost,
  housemateShares: number,
  totalSharesAllHousemates: number,
  snapshotHousemateCount: number
): number {
  if (sharedCost.splitMethod === "shares") {
    if (totalSharesAllHousemates === 0) return 0;
    return (housemateShares / totalSharesAllHousemates) * sharedCost.totalCost;
  } else {
    // "even" split
    if (snapshotHousemateCount === 0) return 0;
    return sharedCost.totalCost / snapshotHousemateCount;
  }
}

/**
 * Returns true if a snapshot represents a transitioning-out housemate.
 * Backwards compatible: snapshots without the field behave as false.
 */
function isTransitionOut(
  snapshot: MonthHousemateSnapshot | undefined
): boolean {
  return snapshot?.transitionOut === true;
}

/**
 * Returns true if a snapshot represents a transitioning-in housemate
 * (just moved in — skips utilities for this billing cycle).
 */
function isTransitionIn(
  snapshot: MonthHousemateSnapshot | undefined
): boolean {
  return snapshot?.transitionIn === true;
}

/**
 * Calculate all dues for a single housemate in a given month.
 */
export function calculateHousemateDues(
  params: CalculateHousemateDuesParams
): HousemateDues {
  const { housemate, monthRecord, receipts, sharedCosts, allHousemates } =
    params;

  const snapshotHousemateCount = Object.keys(
    monthRecord.housemateSnapshots
  ).length;

  // Get snapshot for this housemate (for fee adjustment + transition flags)
  const snapshot = monthRecord.housemateSnapshots[housemate.id];
  const transitionOut = isTransitionOut(snapshot);
  const transitionIn = isTransitionIn(snapshot);

  // Count of housemates who will pay forward-looking charges (room rent,
  // dues, shared costs). Excludes anyone transitioning out, since the
  // remaining housemates absorb the gap on even-split shared costs.
  const forwardLookingCount = Object.values(
    monthRecord.housemateSnapshots
  ).filter((s) => !isTransitionOut(s)).length;

  // Count of housemates who pay backward-looking charges (utilities).
  // Excludes anyone transitioning in, since they weren't here for the
  // prior month's bills.
  const backwardLookingCount = Object.values(
    monthRecord.housemateSnapshots
  ).filter((s) => !isTransitionIn(s)).length;

  // Room Rent: zeroed for transition-out housemates
  const roomRent = transitionOut ? 0 : housemate.roomRent;

  // Utilities: sum of all utilities divided by backward-looking count
  // (transition-in housemates pay 0; remaining housemates cover the bill)
  const totalUtilities = Object.values(monthRecord.utilities).reduce(
    (sum, val) => sum + val,
    0
  );
  const utilities = transitionIn
    ? 0
    : backwardLookingCount > 0
      ? totalUtilities / backwardLookingCount
      : 0;

  // Dues (forward-looking — zeroed for transition-out)
  const groceryDues = transitionOut ? 0 : monthRecord.groceryDues;
  const houseFundDues = transitionOut ? 0 : monthRecord.houseFundDues;

  // Shared Costs (forward-looking — zeroed for transition-out;
  // remaining housemates' divisor uses forwardLookingCount)
  const sharedCostsBreakdown: Record<string, number> = {};
  let sharedCostsTotal = 0;

  const activeSharedCosts = sharedCosts.filter((sc) => sc.active);
  for (const sharedCost of activeSharedCosts) {
    if (transitionOut) {
      sharedCostsBreakdown[sharedCost.name] = 0;
      continue;
    }
    if (sharedCost.splitMethod === "shares") {
      // Total shares across non-transition-out housemates only
      let totalShares = 0;
      Object.entries(monthRecord.housemateSnapshots).forEach(
        ([housemateId, snap]) => {
          if (isTransitionOut(snap)) return;
          const h = allHousemates.find((hm) => hm.id === housemateId);
          if (h) {
            totalShares += h.sharedCostShares[sharedCost.id] ?? 0;
          }
        }
      );

      const housemateShares = housemate.sharedCostShares[sharedCost.id] ?? 0;
      const amount = calculateSharedCostForHousemate(
        sharedCost,
        housemateShares,
        totalShares,
        forwardLookingCount
      );
      sharedCostsBreakdown[sharedCost.name] = amount;
      sharedCostsTotal += amount;
    } else {
      // "even" split — divide by forward-looking count so the remaining
      // housemates absorb the transition-out person's share
      const amount = calculateSharedCostForHousemate(
        sharedCost,
        0, // not used for even split
        0, // not used for even split
        forwardLookingCount
      );
      sharedCostsBreakdown[sharedCost.name] = amount;
      sharedCostsTotal += amount;
    }
  }

  // Receipts: filter by monthKey and housemateId, sum prices
  // Note: receipts are assigned to the NEXT month (e.g., December receipts → January monthKey)
  const monthReceipts = receipts.filter(
    (r) => r.monthKey === monthRecord.monthKey && r.housemateId === housemate.id
  );
  const receiptsTotal = monthReceipts.reduce((sum, r) => sum + r.price, 0);

  // Fee Adjustment (from snapshot)
  const feeAdjustment = snapshot?.feeAdjustment ?? 0;

  // Credit carried forward from prior month (positive — subtracted from total)
  const creditFromPriorMonth = snapshot?.creditFromPriorMonth ?? 0;

  // Grand Total
  const grandTotal =
    roomRent +
    utilities +
    groceryDues +
    houseFundDues +
    sharedCostsTotal -
    receiptsTotal +
    feeAdjustment -
    creditFromPriorMonth;

  return {
    roomRent,
    utilities,
    groceryDues,
    houseFundDues,
    sharedCosts: sharedCostsBreakdown,
    receiptsTotal,
    feeAdjustment,
    creditFromPriorMonth,
    grandTotal,
  };
}

/**
 * Calculate dues summary for all housemates in a month.
 */
export function calculateMonthSummary(
  params: CalculateMonthSummaryParams
): MonthSummaryItem[] {
  const { monthRecord, housemates, receipts, sharedCosts } = params;

  const summary: MonthSummaryItem[] = [];

  // Only calculate for housemates in the snapshot
  Object.entries(monthRecord.housemateSnapshots).forEach(
    ([housemateId, snapshot]) => {
      const housemate = housemates.find((h) => h.id === housemateId);
      if (!housemate) return; // Skip if housemate not found

      const dues = calculateHousemateDues({
        housemate,
        monthRecord,
        receipts,
        sharedCosts,
        allHousemates: housemates,
      });

      summary.push({
        housemate,
        dues,
        paid: snapshot.paid,
        transitionOut: snapshot.transitionOut === true,
        transitionIn: snapshot.transitionIn === true,
      });
    }
  );

  return summary;
}


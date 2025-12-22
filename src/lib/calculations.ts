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
  grandTotal: number;
}

export interface MonthSummaryItem {
  housemate: Housemate;
  dues: HousemateDues;
  paid: "unpaid" | "partial" | "paid";
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

  // Room Rent: use profile value
  const roomRent = housemate.roomRent;

  // Get snapshot for this housemate (for fee adjustment)
  const snapshot = monthRecord.housemateSnapshots[housemate.id];

  // Utilities: sum of all utilities divided by snapshot count
  const totalUtilities = Object.values(monthRecord.utilities).reduce(
    (sum, val) => sum + val,
    0
  );
  const utilities =
    snapshotHousemateCount > 0 ? totalUtilities / snapshotHousemateCount : 0;

  // Dues (same for everyone)
  const groceryDues = monthRecord.groceryDues;
  const houseFundDues = monthRecord.houseFundDues;

  // Shared Costs
  const sharedCostsBreakdown: Record<string, number> = {};
  let sharedCostsTotal = 0;

  const activeSharedCosts = sharedCosts.filter((sc) => sc.active);
  for (const sharedCost of activeSharedCosts) {
    if (sharedCost.splitMethod === "shares") {
      // Calculate total shares across all housemates in snapshot
      let totalShares = 0;
      Object.keys(monthRecord.housemateSnapshots).forEach((housemateId) => {
        const h = allHousemates.find((hm) => hm.id === housemateId);
        if (h) {
          totalShares += h.sharedCostShares[sharedCost.id] ?? 0;
        }
      });

      const housemateShares = housemate.sharedCostShares[sharedCost.id] ?? 0;
      const amount = calculateSharedCostForHousemate(
        sharedCost,
        housemateShares,
        totalShares,
        snapshotHousemateCount
      );
      sharedCostsBreakdown[sharedCost.name] = amount;
      sharedCostsTotal += amount;
    } else {
      // "even" split
      const amount = calculateSharedCostForHousemate(
        sharedCost,
        0, // not used for even split
        0, // not used for even split
        snapshotHousemateCount
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

  // Grand Total
  const grandTotal =
    roomRent +
    utilities +
    groceryDues +
    houseFundDues +
    sharedCostsTotal -
    receiptsTotal +
    feeAdjustment;

  return {
    roomRent,
    utilities,
    groceryDues,
    houseFundDues,
    sharedCosts: sharedCostsBreakdown,
    receiptsTotal,
    feeAdjustment,
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
      });
    }
  );

  return summary;
}


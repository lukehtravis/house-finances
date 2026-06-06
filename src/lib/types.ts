import type { Timestamp } from "firebase/firestore";

export interface Housemate {
  id: string;
  name: string;
  roomRent: number;
  sharedCostShares: Record<string, number>;
  active: boolean;
  /**
   * True when the housemate has fully moved out. Archived housemates are
   * excluded from new month snapshots. They may still appear in past month
   * snapshots (preserved as historical records).
   */
  archived?: boolean;
  /**
   * The final monthKey ("YYYY-MM") the housemate is partially billed for.
   * In that month they only owe utilities (for prior month's bills),
   * receipts, and chores — not room rent, dues, or shared costs.
   * Set when the housemate is archived.
   */
  lastMonthKey?: string;
  createdAt: Timestamp;
}

export type ReceiptFund = "grocery" | "house";

export interface Settings {
  groceryDuesDefault: number;
  houseFundDuesDefault: number;
  utilityLineItems: string[];
  housePassword: string;
}

export type SharedCostSplitMethod = "shares" | "even";

export interface SharedCost {
  id: string;
  name: string;
  totalCost: number;
  splitMethod: SharedCostSplitMethod;
  active: boolean;
}

export type PaidStatus = "unpaid" | "partial" | "paid";

export interface MonthHousemateSnapshot {
  paid: PaidStatus;
  feeAdjustment: number;
  /**
   * True when this is the housemate's transition-out month. They owe only
   * utilities (prior month's bills), receipts, and chores. Room rent,
   * grocery dues, house fund dues, and shared costs are skipped.
   * Other (remaining) housemates absorb the gap on shared costs.
   */
  transitionOut?: boolean;
  /**
   * True when this is the housemate's transition-in month (they just
   * moved in). They skip utilities for this month (those are last
   * month's bills they weren't here for). The utilities divisor for
   * other housemates excludes transition-in people too — so the prior
   * residents pay the full utility bill.
   */
  transitionIn?: boolean;
  /**
   * Credit (positive number) carried forward from the prior month, applied
   * when a housemate's prior-month grandTotal went negative because their
   * receipts exceeded what they owed. Seeded at month creation time and
   * locked in as part of the snapshot — editing the prior month after this
   * month exists does NOT retroactively change this value.
   *
   * Subtracted from this month's grandTotal in calculateHousemateDues.
   */
  creditFromPriorMonth?: number;
}

export interface MonthRecord {
  id: string;
  monthKey: string;
  utilities: Record<string, number>;
  groceryDues: number;
  houseFundDues: number;
  housemateSnapshots: Record<string, MonthHousemateSnapshot>;
  createdAt: Timestamp;
}

export interface Receipt {
  id: string;
  date: Timestamp;
  housemateId: string;
  place: string;
  fund: ReceiptFund;
  price: number;
  description: string;
  monthKey: string;
  createdAt: Timestamp;
}

/**
 * A payout to a departing housemate whose final-month grandTotal went
 * negative (they fronted more in receipts than they owed). Recorded by
 * the financier after sending the money manually from the house fund.
 */
export interface Payout {
  id: string;
  housemateId: string;
  /** The month whose negative grandTotal this payout settles. */
  monthKey: string;
  /** Positive dollar amount paid out. */
  amount: number;
  /** Which fund the money came from. Currently always "house". */
  fund: "house";
  /** Date the financier actually sent the money (Timestamp). */
  paidDate: Timestamp;
  /** Optional note (e.g. "Venmo, ref #abc"). */
  note?: string;
  createdAt: Timestamp;
}

export interface FundBalances {
  id: "balances"; // Singleton document ID
  initialGroceryBalance: number; // Starting balance from previous system
  initialHouseBalance: number; // Starting balance from previous system
  initialChoreBalance?: number; // Starting balance for chore fund (optional, defaults to 0)
  grocery: number; // Current balance (deprecated, calculated on-demand)
  house: number; // Current balance (deprecated, calculated on-demand)
  lastUpdated: Timestamp;
}



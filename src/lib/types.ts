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

export interface FundBalances {
  id: "balances"; // Singleton document ID
  initialGroceryBalance: number; // Starting balance from previous system
  initialHouseBalance: number; // Starting balance from previous system
  initialChoreBalance?: number; // Starting balance for chore fund (optional, defaults to 0)
  grocery: number; // Current balance (deprecated, calculated on-demand)
  house: number; // Current balance (deprecated, calculated on-demand)
  lastUpdated: Timestamp;
}



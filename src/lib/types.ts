import type { Timestamp } from "firebase/firestore";

export interface Housemate {
  id: string;
  name: string;
  roomRent: number;
  sharedCostShares: Record<string, number>;
  active: boolean;
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



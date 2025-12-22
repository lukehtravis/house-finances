# Co-op House Finances App

## Overview

A web application for managing finances in a cooperative housing situation. Tracks monthly rent/dues owed by each housemate, reimbursable receipts, and long-term fund balances.

**Users:**
- **Housemates** (5-8 people): View what they owe, submit receipts for reimbursement, view house finances
- **Financier** (one housemate with admin access): Manages all configuration, inputs monthly utilities, marks payments

**Philosophy:** Maximum transparency. Everyone sees everything.

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Backend:** Firebase (Firestore for data, no auth—just a shared password gate)
- **Hosting:** GitHub Pages (or Firebase Hosting)

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Password gate → landing page with navigation |
| `/rent` | Month selector, defaults to current month |
| `/rent/:monthKey` | Full dues breakdown table for that month (e.g., `/rent/2025-06`) |
| `/receipts` | Add receipt form + filterable history of all receipts |
| `/house-finances` | Running fund balances over time |
| `/admin` | Financier panel: manage housemates, config, monthly params, mark paid |

## Domain Model

### Core Concepts

**Housemate**: A person living in the house. Has a base room rent and shares in various shared costs.

**Shared Cost**: A recurring expense split among housemates (e.g., garage, storage unit). Can be split by shares (weighted) or evenly.

**Receipt**: A purchase made by a housemate for the house, to be reimbursed. Directly selects a fund (Grocery Fund or House Fund) which determines which fund it draws from.

**Month Record**: Configuration for a specific month—utilities entered, payment status, and snapshots of housemates at creation time. Month records are immutable snapshots that preserve historical accuracy even if housemates are added/removed later.

**Funds**: Two separate pools of money:
- **Grocery Fund**: For food/consumables. Fed by grocery dues, depleted by grocery receipts.
- **House Fund**: For repairs, supplies, etc. Fed by house fund dues, depleted by house receipts.

### Dues Calculation Formula

For each housemate in a given month:

```
Grand Total =
  + Room Rent (from housemate profile)
  + Utilities (sum of all utility line items ÷ snapshot housemate count)
  + Grocery Dues (monthly amount, same for everyone)
  + House Fund Dues (monthly amount, same for everyone)
  + Shared Costs (calculated per cost's split method)
  - Receipts (sum of this housemate's receipts for the month)
  + Fee Adjustment (manual override, can be positive or negative, labeled as "Chores" in UI)
```

**Shared Cost Calculation:**
- If `splitMethod === "shares"`: `(housemateShares / totalShares) * totalCost`
- If `splitMethod === "even"`: `totalCost / snapshotHousemateCount`

**Important:** All calculations use `snapshotHousemateCount` (the number of housemates in the month's snapshot at creation time), not the current active housemate count. This ensures historical accuracy.

## Firestore Collections

### `housemates/{id}`
```typescript
{
  name: string;
  roomRent: number;
  sharedCostShares: Record<string, number>;  // { [sharedCostId]: shareCount }
  active: boolean;
  createdAt: Timestamp;
}
```

### `config/settings`
```typescript
{
  groceryDuesDefault: number;
  houseFundDuesDefault: number;
  utilityLineItems: string[];  // ["internet", "water", "electric"]
  housePassword: string;  // Simple shared password for access
}
```

### `sharedCosts/{id}`
```typescript
{
  name: string;           // "Garage", "Storage Unit"
  totalCost: number;
  splitMethod: "shares" | "even";
  active: boolean;
}
```

### `months/{YYYY-MM}`
```typescript
{
  monthKey: string;       // "2025-06"
  utilities: Record<string, number>;  // { internet: 45, water: 80 }
  groceryDues: number;    // Can differ from default
  houseFundDues: number;  // Can differ from default
  housemateSnapshots: Record<string, {
    paid: "unpaid" | "partial" | "paid";
    feeAdjustment: number;  // Manual adjustment (labeled as "Chores" in UI)
  }>;
  createdAt: Timestamp;
}
```

**Note:** Month records are snapshots. The `housemateSnapshots` field captures which housemates were active at the time the month was created. This ensures historical accuracy—if housemates are added or removed later, existing months remain unchanged.

### `receipts/{id}`
```typescript
{
  date: Timestamp;
  housemateId: string;
  place: string;
  fund: "grocery" | "house";  // Directly selects which fund
  price: number;
  description: string;
  monthKey: string;  // Assigned to NEXT month from receipt date
  createdAt: Timestamp;
}
```

**Note:** Receipts are automatically assigned to the **next** month from their date. For example, a receipt dated December 2025 is assigned to January 2026's `monthKey`. This is because rent is calculated at the beginning of the month, before expenses are known.

### `fundBalances/balances` (singleton document)
```typescript
{
  initialGroceryBalance: number;  // Starting balance from previous system
  initialHouseBalance: number;     // Starting balance from previous system
  grocery: number;  // Deprecated, calculated on-demand
  house: number;    // Deprecated, calculated on-demand
  lastUpdated: Timestamp;
}
```

**Note:** Fund balances are calculated on-demand from historical data (dues in, receipts out) plus initial balances. This allows seamless migration from previous systems without importing all historical data.

## Key Implementation Notes

### Month Keys
Use `YYYY-MM` format (e.g., "2025-06") as document IDs and for filtering receipts.

### Creating a New Month
When financier creates a new month:
1. Create month document with default dues values from settings
2. Initialize utilities to 0 for all utility line items
3. Create `housemateSnapshots` for each **currently active** housemate with `paid: "unpaid"`, `feeAdjustment: 0`
4. This snapshot preserves the housemate roster at creation time for historical accuracy

### Receipt Submission
When a receipt is submitted:
1. User must explicitly select a fund (Grocery Fund or House Fund) - no default value
2. Date is automatically set to current PST date
3. `monthKey` is automatically assigned to the **next** month from the receipt date
4. Validation prevents adding receipts to finalized months (months that have ended in PST)
5. No immediate fund balance update—balances are calculated on-demand

### Fund Balance Updates
Fund balances are calculated on-demand from:
- Initial balances (`initialGroceryBalance`, `initialHouseBalance`)
- All historical dues (contributions)
- All historical receipts (expenses)

This approach allows seamless migration from previous systems by setting initial balances without importing all historical data.

### Month Finalization
Months are automatically considered "finalized" if the current PST date is past the end of that month. There is no manual `finalized` boolean—the system uses `isMonthFinalized(monthKey)` to determine this dynamically. Finalized months cannot have receipts added to them.

### No Authentication
The app uses a simple shared password stored in Firestore. Check on app load, store in sessionStorage. This is intentionally simple—not a bank, just a house tool.

## File Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components (Button, Input, Card, etc.)
│   ├── layout/          # Nav, Layout wrapper
│   └── domain/          # Domain-specific components (DuesTable, ReceiptForm, etc.)
├── pages/
│   ├── Home.tsx
│   ├── Rent.tsx
│   ├── RentMonth.tsx
│   ├── Receipts.tsx
│   ├── HouseFinances.tsx
│   └── Admin.tsx
├── hooks/
│   ├── useFirestore.ts        # Custom hooks for Firestore operations
│   └── useMonthCalculations.ts # Hook for calculating month summaries
├── lib/
│   ├── firebase.ts      # Firebase init
│   ├── calculations.ts  # Dues calculation logic (pure functions)
│   ├── types.ts         # TypeScript interfaces
│   └── utils.ts         # Utility functions (formatting, dates, errors)
├── App.tsx
└── main.tsx
```

## Conventions

- Use TypeScript strictly—define interfaces in `lib/types.ts`
- Tailwind for all styling, no separate CSS files
- Functional components with hooks only
- Keep components small and focused
- Co-locate related logic (e.g., form + validation in same file is fine)
- Use `date-fns` for date manipulation
- Format currency with `formatCurrency()` utility function
- All date operations use PST (Pacific Standard Time)
- Calculations are pure functions in `lib/calculations.ts` (no side effects)
- Real-time data via Firestore `onSnapshot` listeners
- User-friendly error messages via `getFirestoreErrorMessage()` utility

## Common Tasks

### Adding a new shared cost type
1. Add document to `sharedCosts` collection via admin
2. Update each housemate's `sharedCostShares` to include their share count
3. Calculation engine automatically picks it up

### Changing dues amounts mid-year
1. Update `config/settings` for future months
2. Existing month documents retain their values (immutable once created)

### Correcting a past month
1. Navigate to `/admin` → "Months" tab
2. Click "Edit" on the specific month
3. Edit utilities, dues, payment status, or fee adjustments (chores)
4. Note: You cannot edit finalized months (months that have ended)
5. Fund balances automatically recalculate on-demand

### Setting initial fund balances
1. Navigate to `/admin` → "Fund Balances" tab
2. Enter `initialGroceryBalance` and `initialHouseBalance`
3. These represent starting balances from a previous system
4. All future calculations will include these initial amounts

### Important Notes

- **Month Snapshots**: Month records capture housemates at creation time. If housemates are added/removed later, existing months remain unchanged, but new months will reflect the current active housemate list.
- **Receipt Month Assignment**: Receipts are assigned to the next month from their date (e.g., December receipts → January monthKey).
- **No Room Rent Override**: Room rent always comes from the housemate profile—there is no month-specific override.
- **Fund Selection**: Receipts require explicit fund selection (Grocery Fund or House Fund)—no default value to prevent accidental mis-categorization.
- **Chores**: The "Fee Adjustment" field is labeled as "Chores" in the UI for clarity.

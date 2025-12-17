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

**Receipt**: A purchase made by a housemate for the house, to be reimbursed. Categorized by type, which determines which fund it draws from.

**Month Record**: Configuration for a specific month—utilities entered, any per-housemate overrides, payment status.

**Funds**: Two separate pools of money:
- **Grocery Fund**: For food/consumables. Fed by grocery dues, depleted by grocery receipts.
- **House Fund**: For repairs, supplies, etc. Fed by house fund dues, depleted by house receipts.

### Dues Calculation Formula

For each housemate in a given month:

```
Grand Total =
  + Room Rent (from profile, or month-specific override)
  + Utilities (sum of all utility line items ÷ active housemate count)
  + Grocery Dues (monthly amount, same for everyone)
  + House Fund Dues (monthly amount, same for everyone)
  + Shared Costs (calculated per cost's split method)
  - Receipts (sum of this housemate's receipts for the month)
  + Fee Adjustment (manual override, can be positive or negative)
```

**Shared Cost Calculation:**
- If `splitMethod === "shares"`: `(housemateShares / totalShares) * totalCost`
- If `splitMethod === "even"`: `totalCost / activeHousemateCount`

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
  receiptCategories: Array<{
    name: string;
    fund: "grocery" | "house";
  }>;
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
    feeAdjustment: number;
    roomRentOverride?: number;  // Only if different from profile
  }>;
  createdAt: Timestamp;
}
```

### `receipts/{id}`
```typescript
{
  date: Timestamp;
  housemateId: string;
  place: string;
  category: string;
  price: number;
  description: string;
  monthKey: string;  // "2025-06"
  createdAt: Timestamp;
}
```

### `fundBalances/current`
```typescript
{
  grocery: number;
  house: number;
  lastUpdated: Timestamp;
}
```

## Key Implementation Notes

### Month Keys
Use `YYYY-MM` format (e.g., "2025-06") as document IDs and for filtering receipts.

### Creating a New Month
When financier creates a new month:
1. Create month document with default dues values from settings
2. Initialize `housemateSnapshots` for each active housemate with `paid: "unpaid"`, `feeAdjustment: 0`

### Receipt Submission
When a receipt is submitted:
1. Validate category exists
2. Store with `monthKey` based on receipt date (or current month—decide on UX)
3. No immediate fund balance update—balances are calculated on demand or updated when month is "closed"

### Fund Balance Updates
Option A: Calculate on-the-fly from all historical data
Option B: Store running balance, update when month is finalized

Recommend Option B for performance, with a recalculation utility in admin if needed.

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
│   └── useFirestore.ts  # Custom hooks for Firestore operations
├── lib/
│   ├── firebase.ts      # Firebase init
│   ├── calculations.ts  # Dues calculation logic
│   └── types.ts         # TypeScript interfaces
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
- Format currency with `Intl.NumberFormat`

## Common Tasks

### Adding a new shared cost type
1. Add document to `sharedCosts` collection via admin
2. Update each housemate's `sharedCostShares` to include their share count
3. Calculation engine automatically picks it up

### Changing dues amounts mid-year
1. Update `config/settings` for future months
2. Existing month documents retain their values (immutable once created)

### Correcting a past month
1. Navigate to `/admin` → month management
2. Edit the specific month's values or fee adjustments
3. Recalculate fund balances if needed

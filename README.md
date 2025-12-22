# Co-op House Finances App

A web application for managing finances in a cooperative housing situation. Tracks monthly rent/dues owed by each housemate, reimbursable receipts, and long-term fund balances.

## Overview

This application provides maximum transparency for house finances. All housemates can view what they owe, submit receipts for reimbursement, and track house fund balances. One designated "financier" manages configuration, inputs monthly utilities, and marks payment status.

**Philosophy:** Maximum transparency. Everyone sees everything.

## Features

- **Monthly Rent Calculation**: Automatically calculates each housemate's total dues based on room rent, utilities, shared costs, and receipts
- **Receipt Management**: Submit and track reimbursable receipts, automatically assigned to the appropriate month
- **Fund Tracking**: Monitor Grocery Fund and House Fund balances over time
- **Admin Panel**: Manage housemates, settings, shared costs, monthly records, and initial fund balances
- **Real-time Updates**: All data syncs in real-time via Firestore
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Build Tool**: Vite
- **Backend**: Firebase Firestore (no authentication—uses simple password gate)
- **Routing**: React Router DOM
- **Date Handling**: date-fns
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Firebase project with Firestore enabled

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd house-finances
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with your Firebase configuration:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

4. Configure Firestore:
   - Enable Firestore in your Firebase console
   - Set up security rules (see "Security" section below)
   - Create the initial `config/settings` document with default values

5. Run the development server:
```bash
npm run dev
```

6. Build for production:
```bash
npm run build
```

## Architecture

### File Structure

```
src/
├── components/
│   ├── layout/
│   │   └── Layout.tsx          # Main layout with navigation
│   └── ui/
│       └── PageShell.tsx      # Page wrapper component
├── hooks/
│   ├── useFirestore.ts        # Custom hooks for Firestore operations
│   └── useMonthCalculations.ts # Hook for calculating month summaries
├── lib/
│   ├── firebase.ts            # Firebase initialization
│   ├── types.ts               # TypeScript interfaces
│   ├── calculations.ts        # Dues calculation logic (pure functions)
│   └── utils.ts               # Utility functions (formatting, dates, errors)
├── pages/
│   ├── Home.tsx               # Landing page
│   ├── Rent.tsx               # Month selector and current month summary
│   ├── RentMonth.tsx          # Detailed breakdown for a specific month
│   ├── Receipts.tsx           # Receipt submission and history
│   ├── HouseFinances.tsx      # Fund balance tracking over time
│   └── Admin.tsx              # Administration panel
├── App.tsx                    # Main app component with routing
└── main.tsx                   # Entry point
```

### Key Architectural Decisions

#### 1. **Month Snapshots**
Month records (`MonthRecord`) capture a snapshot of housemates at the time of creation. This ensures historical accuracy—if housemates are added or removed later, existing months remain unchanged. The `housemateSnapshots` field stores the state of each housemate (paid status, fee adjustment) for that specific month.

**Why:** This prevents retroactive changes to past months when the housemate roster changes, maintaining financial integrity.

#### 2. **Receipt Month Assignment**
Receipts are automatically assigned to the **next** month from their date. For example, a receipt dated December 2025 is assigned to January 2026's `monthKey`.

**Why:** Rent is calculated at the beginning of the month, before expenses are known. December's receipts should be credited against January's rent calculation.

#### 3. **Automated Month Finalization**
Months are automatically considered "finalized" if the current PST date is past the end of that month. There is no manual `finalized` boolean—the system uses `isMonthFinalized(monthKey)` to determine this dynamically.

**Why:** Simplifies month management and prevents accidental edits to past months.

#### 4. **Pure Calculation Functions**
All financial calculations are pure functions in `lib/calculations.ts`. They take data as parameters and return calculated results without side effects.

**Why:** Makes calculations testable, predictable, and easy to reason about. Calculations can be run on-demand without storing intermediate results.

#### 5. **Real-time Data with Firestore**
The app uses Firestore's real-time listeners (`onSnapshot`) via custom hooks (`useCollection`, `useDocument`). All data updates are reflected immediately across all users.

**Why:** Provides instant feedback and ensures all users see the same data without manual refresh.

#### 6. **Initial Fund Balances**
The system supports `initialGroceryBalance` and `initialHouseBalance` to allow migration from previous systems without importing historical data.

**Why:** Enables seamless transition from spreadsheet-based systems by setting starting balances.

## Data Model

### Firestore Collections

#### `housemates/{id}`
```typescript
{
  name: string;
  roomRent: number;
  sharedCostShares: Record<string, number>; // { [sharedCostId]: shareCount }
  active: boolean;
  createdAt: Timestamp;
}
```

#### `config/settings` (singleton document)
```typescript
{
  groceryDuesDefault: number;
  houseFundDuesDefault: number;
  utilityLineItems: string[]; // ["internet", "water", "electric"]
  housePassword: string;
}
```

#### `sharedCosts/{id}`
```typescript
{
  name: string; // "Garage", "Storage Unit"
  totalCost: number;
  splitMethod: "shares" | "even";
  active: boolean;
}
```

#### `months/{YYYY-MM}`
```typescript
{
  monthKey: string; // "2025-06"
  utilities: Record<string, number>; // { internet: 45, water: 80 }
  groceryDues: number;
  houseFundDues: number;
  housemateSnapshots: Record<string, {
    paid: "unpaid" | "partial" | "paid";
    feeAdjustment: number; // Manual adjustment (can be positive or negative)
  }>;
  createdAt: Timestamp;
}
```

#### `receipts/{id}`
```typescript
{
  date: Timestamp;
  housemateId: string;
  place: string;
  fund: "grocery" | "house";
  price: number;
  description: string;
  monthKey: string; // Assigned to NEXT month from date
  createdAt: Timestamp;
}
```

#### `fundBalances/balances` (singleton document)
```typescript
{
  initialGroceryBalance: number;
  initialHouseBalance: number;
  grocery: number; // Deprecated, calculated on-demand
  house: number; // Deprecated, calculated on-demand
  lastUpdated: Timestamp;
}
```

## Dues Calculation

For each housemate in a given month, the total is calculated as:

```
Grand Total =
  + Room Rent (from housemate profile)
  + Utilities (sum of all utility line items ÷ snapshot housemate count)
  + Grocery Dues (monthly amount, same for everyone)
  + House Fund Dues (monthly amount, same for everyone)
  + Shared Costs (calculated per cost's split method)
  - Receipts (sum of this housemate's receipts for the month)
  + Fee Adjustment (manual override from month snapshot)
```

### Shared Cost Calculation

- **If `splitMethod === "shares"`**: `(housemateShares / totalShares) * totalCost`
- **If `splitMethod === "even"`**: `totalCost / snapshotHousemateCount`

**Important:** Shared costs use the `snapshotHousemateCount` (number of housemates in the month's snapshot), not the current active housemate count. This ensures historical accuracy.

### Utilities Calculation

Utilities are split evenly among all housemates in the month's snapshot:
```
utilitiesPerHousemate = sum(all utility line items) / snapshotHousemateCount
```

## User Flows

### Adding a Receipt

1. Navigate to `/receipts`
2. Fill out the form:
   - Select person
   - Enter place/store
   - **Select fund** (Grocery Fund or House Fund) - required
   - Enter price
   - Optionally add description
3. Submit (date is automatically set to current PST date)
4. Receipt is assigned to the next month's `monthKey`
5. Validation prevents adding receipts to finalized months

### Creating a New Month

1. Navigate to `/admin` → "Months" tab
2. Click "Create Next Month"
3. System:
   - Creates month record with default dues from settings
   - Initializes utilities to 0 for all utility line items
   - Creates snapshots for all currently active housemates
   - Sets all housemates to "unpaid" status with 0 fee adjustment
4. Financier can then:
   - Edit utilities
   - Adjust dues if needed
   - Mark payment status as housemates pay
   - Add fee adjustments (e.g., for chores)

### Viewing Rent Breakdown

1. Navigate to `/rent` to see current month summary
2. Click on a month to see detailed breakdown at `/rent/:monthKey`
3. View includes:
   - Room rent per housemate
   - Utilities breakdown
   - Dues (grocery and house fund)
   - Shared costs
   - Receipts (subtracted)
   - Fee adjustments
   - Grand total
   - Payment status

### Tracking Fund Balances

1. Navigate to `/house-finances`
2. View current balances for Grocery Fund and House Fund
3. See monthly breakdown showing:
   - Dues In (contributions)
   - Receipts Out (expenses)
   - Net Change
   - Running Balance
4. Filter by time period (Last 12 Months, All Time, or specific year)

## Security

### Firestore Security Rules

The app uses a simple password gate (no Firebase Authentication). You should set up Firestore security rules to restrict access. Example rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write if password matches (you'll need to implement this check)
    // For development, you might use:
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 1, 1);
    }
  }
}
```

**Note:** For production, implement proper authentication or IP-based restrictions. The current password gate is stored in Firestore and checked client-side, which is not secure for sensitive data.

## Important Notes

### Month Keys
- Format: `YYYY-MM` (e.g., "2025-06")
- Used as document IDs for month records
- Used for filtering receipts and calculating fund balances

### PST Timezone
- All date operations use PST (Pacific Standard Time)
- Receipt dates are set to current PST date
- Month finalization is based on PST date

### Data Integrity
- Month records are immutable snapshots—editing a month only updates utilities, dues, and housemate status, not the snapshot roster
- Receipts cannot be added to finalized months
- Fund balances are calculated on-demand from historical data

### Removing Features
- **Room Rent Override**: Removed. Room rent always comes from the housemate profile.
- **Receipt Categories**: Removed. Receipts directly select a fund (Grocery Fund or House Fund).
- **Manual Finalization**: Removed. Months are automatically finalized based on PST date.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Code Style

- TypeScript strict mode
- Functional components with hooks only
- Tailwind CSS for all styling
- Pure functions for calculations
- Real-time data via Firestore listeners

### Adding New Features

1. Define TypeScript interfaces in `lib/types.ts`
2. Add Firestore hooks in `hooks/useFirestore.ts` if needed
3. Create calculation functions in `lib/calculations.ts` (keep them pure)
4. Add utility functions in `lib/utils.ts` for formatting/helpers
5. Create page components in `pages/`
6. Update routing in `App.tsx`

## Troubleshooting

### Receipts not appearing
- Check that the receipt's `monthKey` matches the month you're viewing
- Remember: December receipts are assigned to January's monthKey

### Calculations seem wrong
- Verify month record has correct `housemateSnapshots` (snapshot count)
- Check that shared costs are active and have correct split method
- Ensure receipts are assigned to the correct month

### Firestore errors
- Check that Firestore is enabled in Firebase console
- Verify security rules allow read/write
- Check that environment variables are set correctly
- See `lib/utils.ts` for user-friendly error messages

## License

Private project for internal use.


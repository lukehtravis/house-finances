# Cursor Prompts: Co-op House Finances App

Use these prompts in sequence. Each builds on the previous phase. Always reference CLAUDE.md for context.

---

## Phase 1: Project Scaffold

```
Create a new React + TypeScript + Vite project for a co-op house finances app. Set up the following:

1. Initialize with Vite, React, TypeScript
2. Install and configure Tailwind CSS
3. Install dependencies: react-router-dom, firebase, date-fns
4. Set up the file structure as described in CLAUDE.md
5. Create the Firebase configuration file (lib/firebase.ts) with placeholder config values and comments showing where to add real credentials
6. Create lib/types.ts with all the TypeScript interfaces from CLAUDE.md (Housemate, SharedCost, Settings, MonthRecord, Receipt, FundBalances)
7. Set up react-router with routes for: /, /rent, /rent/:monthKey, /receipts, /house-finances, /admin
8. Create a simple Layout component with navigation between all routes
9. Create a PasswordGate component that:
   - Shows a password input on first visit
   - Checks against a hardcoded password for now (we'll connect to Firestore later)
   - Stores successful auth in sessionStorage
   - Wraps the entire app
10. Create placeholder page components that just show the route name

Use Tailwind for styling. Keep it clean and minimal—we'll add polish later. The app should be functional to navigate between all routes after entering the password.
```

---

## Phase 2: Firebase Connection & Admin - Housemates

```
Reference CLAUDE.md for the data model. Now let's connect Firebase and build housemate management.

1. Update lib/firebase.ts to properly initialize Firestore
2. Create a custom hook useFirestore.ts with helpers for:
   - Generic document CRUD operations
   - Real-time listeners (onSnapshot wrappers)
   - Collection queries
3. Create the Admin page with tabs or sections for different admin functions. Start with "Housemates" section.
4. Build the Housemates admin section:
   - List all housemates (name, room rent, active status)
   - Add new housemate form (name, roomRent, active boolean)
   - Edit existing housemate (inline or modal)
   - Toggle active status (don't delete, just deactivate)
   - For now, skip sharedCostShares—we'll add that after shared costs exist
5. Create seed data utility that can be run from admin to populate initial test data:
   - 6 sample housemates with varying room rents ($800-$1200)
   - Mark 5 as active, 1 as inactive

Style with Tailwind. Use a clean table or card layout for the housemate list. Forms should have proper labels and validation (required fields, rent must be positive number).
```

---

## Phase 3: Admin - Settings & Shared Costs

```
Continue building the admin panel. Reference CLAUDE.md for data structures.

1. Add "Settings" section to Admin page:
   - Edit groceryDuesDefault (number input)
   - Edit houseFundDuesDefault (number input)
   - Manage utilityLineItems (add/remove string items like "internet", "water", "electric")
   - Manage receiptCategories (add/remove, each has name + fund dropdown of "grocery" or "house")
   - Store/update in Firestore at config/settings

2. Add "Shared Costs" section to Admin page:
   - List all shared costs (name, total cost, split method, active)
   - Add new shared cost form (name, totalCost, splitMethod dropdown)
   - Edit existing shared costs
   - Toggle active status

3. Go back to Housemates section and add sharedCostShares editing:
   - For each housemate, show all active shared costs
   - Allow setting their share count for each (default 0)
   - Display as a simple grid or table within the housemate edit form

4. Update the password gate to read the password from Firestore config/settings.housePassword instead of hardcoded value. Add a field in settings to set/update this password.

Create sensible defaults when settings document doesn't exist yet.
```

---

## Phase 4: Receipts

```
Build the receipts system. Reference CLAUDE.md for the Receipt interface.

1. Create the Receipts page with two sections:

   **Add Receipt Form:**
   - Date picker (default to today)
   - Person dropdown (populated from active housemates)
   - Place/store text input
   - Category dropdown (populated from settings.receiptCategories)
   - Price input (currency, required)
   - Description textarea (optional)
   - Submit saves to Firestore receipts collection
   - Auto-generate monthKey from the receipt date (YYYY-MM format)
   - Show success message and clear form on submit

   **Receipt History:**
   - Display all receipts in a table, newest first
   - Columns: Date, Person, Place, Category, Price, Description
   - Add filters:
     - By person (dropdown)
     - By category (dropdown)
     - By month (dropdown or date range)
   - Show total of filtered receipts at bottom
   - Format price as currency ($XX.XX)
   - Format date nicely (e.g., "Jun 15, 2025")

2. Consider mobile experience—the form should work well on phones since housemates might add receipts while shopping.

Style cleanly with Tailwind. The receipt list might get long, so consider pagination or virtual scrolling if time permits (basic infinite scroll is fine for MVP).
```

---

## Phase 5: Month Management

```
Build the month management system in Admin. Reference CLAUDE.md for MonthRecord structure.

1. Add "Months" section to Admin page:

   **Month List:**
   - Show all existing months, newest first
   - Display: monthKey, whether utilities are entered, count of paid/partial/unpaid
   - Click to edit a month

   **Create New Month:**
   - Button to create next month (auto-detect from latest existing month, or current month if none)
   - On creation:
     - Set monthKey (YYYY-MM)
     - Copy groceryDues and houseFundDues from settings defaults
     - Initialize utilities object with keys from settings.utilityLineItems, values as 0
     - Create housemateSnapshots for each active housemate with paid: "unpaid", feeAdjustment: 0
   
   **Edit Month:**
   - Edit utilities (show each line item from settings, input for each)
   - Edit groceryDues and houseFundDues for this month (override defaults)
   - For each housemate in snapshots:
     - Show their name
     - Paid status dropdown (unpaid/partial/paid)
     - Fee adjustment input (can be negative)
     - Optional room rent override input
   - Save updates to Firestore

2. Add validation: don't allow creating a month that already exists.

3. Display total utilities and per-person utility share on the edit screen for quick reference.
```

---

## Phase 6: Dues Calculation Engine

```
Build the calculation engine that computes what each housemate owes. Reference CLAUDE.md for the formula.

1. Create lib/calculations.ts with pure functions:

   **calculateSharedCostForHousemate(sharedCost, housemateShares, totalSharesAllHousemates, activeHousemateCount):**
   - If splitMethod is "shares": (housemateShares / totalShares) * totalCost
   - If splitMethod is "even": totalCost / activeHousemateCount
   - Return the amount this housemate owes for this shared cost

   **calculateHousemateDues(params):**
   Input: { housemate, monthRecord, receipts, sharedCosts, allHousemates }
   Returns: {
     roomRent: number,
     utilities: number,
     groceryDues: number,
     houseFundDues: number,
     sharedCosts: Record<string, number>,  // { [sharedCostName]: amount }
     receiptsTotal: number,
     feeAdjustment: number,
     grandTotal: number
   }

   **calculateMonthSummary(params):**
   Input: { monthRecord, housemates, receipts, sharedCosts }
   Returns: Array of { housemate, dues, paid } for all active housemates

2. Write this as pure functions with no Firebase dependencies—pass in all data. This makes it testable and predictable.

3. Create a hook useMonthCalculations(monthKey) that:
   - Fetches all needed data (month record, housemates, receipts for month, shared costs)
   - Runs calculations
   - Returns the summary plus loading/error states

4. Add a simple test or console validation in the admin that shows calculation results for the current month.
```

---

## Phase 7: Rent Views

```
Build the rent/dues display pages. These are the primary housemate-facing views.

1. **Rent Landing (/rent):**
   - Show current month prominently with quick summary (your total, paid status)
   - "View Details" link to /rent/[currentMonth]
   - Show next month if it exists (or prompt that it hasn't been created yet)
   - List of previous months (last 6-12), each linking to their detail page
   - Consider a month picker/calendar for accessing older months

2. **Rent Month Detail (/rent/:monthKey):**
   - Full breakdown table with all housemates as rows
   - Columns:
     - Name
     - Room Rent
     - Utilities (show calculated per-person amount)
     - Grocery Dues
     - House Fund Dues
     - One column per active shared cost (e.g., "Garage")
     - Receipts (show as negative/credit)
     - Fee Adjustment
     - Grand Total
     - Paid Status (with visual indicator: ✓, ~, ✗ or color coding)
   - Show column totals at bottom where relevant
   - Display utility breakdown somewhere (what the total utility costs were)
   
3. Navigation:
   - Previous/Next month arrows
   - Breadcrumb back to /rent
   - Handle non-existent months gracefully (show message, not error)

4. Make the table responsive—on mobile, consider a card layout per person instead of a wide table.

Use the calculation engine from Phase 6. Style for clarity—this is the most-viewed page.
```

---

## Phase 8: House Finances Dashboard

```
Build the house finances view showing fund balances over time.

1. Create a fundBalances management system:
   
   **In Admin, add "Fund Balances" section:**
   - Show current grocery fund balance
   - Show current house fund balance  
   - Input to manually set/adjust each balance (for initialization or corrections)
   - Button to recalculate from scratch (sum all dues in - receipts out across all months)

2. **House Finances Page (/house-finances):**
   
   **Current Balances (prominent):**
   - Large display of current Grocery Fund balance
   - Large display of current House Fund balance
   - Last updated timestamp
   
   **Monthly Breakdown Table:**
   - Rows: Each month that exists
   - Columns per fund: Dues In, Receipts Out, Net Change, Running Balance
   - Calculate Dues In = groceryDues * activeHousemateCount (for grocery fund)
   - Calculate Receipts Out = sum of receipts in that category for the month
   - Show running balance progression
   
   **Time Controls:**
   - Year tabs (2024, 2025, etc.) based on existing data
   - Or a "Last 12 months" / "All time" toggle
   
3. Visual touches:
   - Color code positive/negative balances
   - Maybe a simple line chart showing fund balance over time (optional, use recharts if adding)

4. Calculate everything on-demand from month records and receipts—don't require separate balance tracking unless performance becomes an issue.
```

---

## Phase 9: Polish & Edge Cases

```
Final polish pass. Fix edge cases and improve UX.

1. **Empty States:**
   - No housemates yet → prompt to add in admin
   - No months created → prompt to create first month
   - No receipts → friendly empty state
   - Month doesn't exist → graceful message with link to existing months

2. **Loading States:**
   - Add loading spinners/skeletons for all data fetches
   - Disable form submissions while saving

3. **Error Handling:**
   - Firestore errors should show user-friendly messages
   - Form validation errors inline

4. **Mobile Responsiveness:**
   - Test all pages on mobile viewport
   - Ensure receipt form is easy to use on phone
   - Make tables scroll horizontally or convert to cards on small screens

5. **Quality of Life:**
   - Add confirmation dialogs for destructive actions
   - Show success toasts on saves
   - Remember filter selections in receipts page (sessionStorage)
   - Format all currency consistently
   - Format all dates consistently

6. **Performance:**
   - Add appropriate Firestore indexes if queries are slow
   - Consider pagination for receipts if list gets very long

7. **Final Review:**
   - Walk through as a housemate: can you easily see what you owe and add a receipt?
   - Walk through as financier: can you efficiently set up a new month and mark payments?
```

---

## Deployment Notes

When ready to deploy:

1. Create a Firebase project at console.firebase.google.com
2. Enable Firestore Database
3. Copy config values to your firebase.ts
4. Set up Firestore security rules (since no auth, rules should at minimum prevent arbitrary writes to config):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write for now (tighten based on your comfort)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

5. Build the app: `npm run build`
6. Deploy to GitHub Pages or Firebase Hosting

For GitHub Pages with client-side routing, you'll need to handle the 404 → index.html redirect (copy index.html to 404.html, or use HashRouter).

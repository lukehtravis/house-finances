import { FormEvent, useMemo, useState, useEffect } from "react";
import { PageShell } from "../components/ui/PageShell";
import {
  useCollection,
  useDocument,
  addDocument,
  updateDocument,
  setDocument,
} from "../hooks/useFirestore";
import type {
  Housemate,
  Settings,
  SharedCost,
  SharedCostSplitMethod,
  MonthRecord,
  PaidStatus,
  FundBalances,
  Receipt,
  Payout,
} from "../lib/types";
import { calculateHousemateDues } from "../lib/calculations";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { useMonthCalculations } from "../hooks/useMonthCalculations";
import {
  formatMonthKey,
  formatCurrency,
  formatDate,
  getFirestoreErrorMessage,
  isMonthFinalized,
} from "../lib/utils";

type HousemateFormState = {
  name: string;
  roomRent: string;
  active: boolean;
  sharedCostShares: Record<string, string>;
};

const emptyHousemateForm: HousemateFormState = {
  name: "",
  roomRent: "",
  active: true,
  sharedCostShares: {},
};

type SharedCostFormState = {
  name: string;
  totalCost: string;
  splitMethod: SharedCostSplitMethod;
};

const emptySharedCostForm: SharedCostFormState = {
  name: "",
  totalCost: "",
  splitMethod: "even",
};

type SettingsFormState = {
  groceryDuesDefault: string;
  houseFundDuesDefault: string;
  utilityLineItems: string[];
  housePassword: string;
};

const defaultSettings: Settings = {
  groceryDuesDefault: 100,
  houseFundDuesDefault: 50,
  utilityLineItems: ["internet", "water", "electric"],
  housePassword: "",
};

export function Admin() {
  const [activeTab, setActiveTab] = useState<
    | "housemates"
    | "settings"
    | "shared-costs"
    | "months"
    | "fund-balances"
    | "payouts"
  >("housemates");

  // Housemates
  const {
    data: housemates,
    loading: housematesLoading,
    error: housematesError,
  } = useCollection<Housemate>("housemates", {
    orderByField: "createdAt",
    orderDirection: "asc",
  });

  const [housemateForm, setHousemateForm] =
    useState<HousemateFormState>(emptyHousemateForm);
  const [editingHousemateId, setEditingHousemateId] = useState<string | null>(
    null
  );
  const [housemateFormError, setHousemateFormError] = useState<string | null>(
    null
  );

  const editingHousemate = useMemo(
    () => housemates.find((h) => h.id === editingHousemateId) ?? null,
    [housemates, editingHousemateId]
  );

  // Archive workflow state
  const [archivingHousemateId, setArchivingHousemateId] = useState<string | null>(
    null
  );
  const [archiveForm, setArchiveForm] = useState({
    mode: "transition" as "transition" | "immediate",
    lastMonthKey: "",
  });
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  const archivingHousemate = useMemo(
    () => housemates.find((h) => h.id === archivingHousemateId) ?? null,
    [housemates, archivingHousemateId]
  );

  // Shared Costs
  const {
    data: sharedCosts,
    loading: sharedCostsLoading,
    error: sharedCostsError,
  } = useCollection<SharedCost>("sharedCosts", {
    orderByField: "name",
    orderDirection: "asc",
  });

  const [sharedCostForm, setSharedCostForm] =
    useState<SharedCostFormState>(emptySharedCostForm);
  const [editingSharedCostId, setEditingSharedCostId] = useState<string | null>(
    null
  );
  const [sharedCostFormError, setSharedCostFormError] = useState<string | null>(
    null
  );

  const editingSharedCost = useMemo(
    () => sharedCosts.find((sc) => sc.id === editingSharedCostId) ?? null,
    [sharedCosts, editingSharedCostId]
  );

  const activeSharedCosts = useMemo(
    () => sharedCosts.filter((sc) => sc.active),
    [sharedCosts]
  );

  // Months
  const {
    data: months,
    loading: monthsLoading,
    error: monthsError,
  } = useCollection<MonthRecord>("months", {
    orderByField: "monthKey",
    orderDirection: "desc",
  });

  // Receipts (needed for credit seeding at month creation + payout detection)
  const { data: receipts } = useCollection<Receipt>("receipts");

  // Payouts (manual credit settlements to departed housemates)
  const { data: payouts } = useCollection<Payout>("payouts", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [creatingMonth, setCreatingMonth] = useState(false);

  // Settings
  const {
    data: settingsDoc,
    loading: settingsLoading,
    error: settingsError,
  } = useDocument<Settings>("config", "settings");

  const {
    data: fundBalancesDoc,
    loading: fundBalancesLoading,
    error: fundBalancesDocError,
  } = useDocument<FundBalances>("fundBalances", "balances");

  const [fundBalancesForm, setFundBalancesForm] = useState({
    initialGroceryBalance: "",
    initialHouseBalance: "",
    initialChoreBalance: "",
  });
  const [savingFundBalances, setSavingFundBalances] = useState(false);
  const [fundBalancesFormError, setFundBalancesFormError] = useState<
    string | null
  >(null);
  const [fundBalancesSuccess, setFundBalancesSuccess] = useState<string | null>(
    null
  );

  // Initialize fund balances form
  useEffect(() => {
    if (fundBalancesDoc) {
      setFundBalancesForm({
        initialGroceryBalance: String(
          fundBalancesDoc.initialGroceryBalance ?? 0
        ),
        initialHouseBalance: String(fundBalancesDoc.initialHouseBalance ?? 0),
        initialChoreBalance: String(fundBalancesDoc.initialChoreBalance ?? 0),
      });
    } else {
      setFundBalancesForm({
        initialGroceryBalance: "0",
        initialHouseBalance: "0",
        initialChoreBalance: "0",
      });
    }
  }, [fundBalancesDoc]);

  async function handleSaveFundBalances() {
    setFundBalancesFormError(null);
    setFundBalancesSuccess(null);

    const groceryNum = Number(fundBalancesForm.initialGroceryBalance);
    const houseNum = Number(fundBalancesForm.initialHouseBalance);
    const choreNum = Number(fundBalancesForm.initialChoreBalance);

    if (!Number.isFinite(groceryNum) || groceryNum < 0) {
      setFundBalancesFormError(
        "Grocery balance must be a non-negative number."
      );
      return;
    }
    if (!Number.isFinite(houseNum) || houseNum < 0) {
      setFundBalancesFormError("House balance must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(choreNum) || choreNum < 0) {
      setFundBalancesFormError("Chore balance must be a non-negative number.");
      return;
    }

    setSavingFundBalances(true);
    try {
      await setDocument<Omit<FundBalances, "id">>("fundBalances", "balances", {
        initialGroceryBalance: groceryNum,
        initialHouseBalance: houseNum,
        initialChoreBalance: choreNum,
        grocery: 0, // Deprecated, kept for backwards compatibility
        house: 0, // Deprecated, kept for backwards compatibility
      } as Omit<FundBalances, "id">);
      setFundBalancesSuccess("Initial balances saved successfully!");
      setTimeout(() => setFundBalancesSuccess(null), 3000);
    } catch (err) {
      setFundBalancesFormError(
        err instanceof Error ? err.message : "Failed to save balances."
      );
    } finally {
      setSavingFundBalances(false);
    }
  }

  const [settingsForm, setSettingsForm] = useState<SettingsFormState>({
    groceryDuesDefault: "",
    houseFundDuesDefault: "",
    utilityLineItems: [],
    housePassword: "",
  });
  const [newUtilityItem, setNewUtilityItem] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Initialize settings form when data loads
  useMemo(() => {
    if (settingsDoc) {
      setSettingsForm({
        groceryDuesDefault: String(
          settingsDoc.groceryDuesDefault ?? defaultSettings.groceryDuesDefault
        ),
        houseFundDuesDefault: String(
          settingsDoc.houseFundDuesDefault ??
            defaultSettings.houseFundDuesDefault
        ),
        utilityLineItems:
          settingsDoc.utilityLineItems ?? defaultSettings.utilityLineItems,
        housePassword:
          settingsDoc.housePassword ?? defaultSettings.housePassword,
      });
    } else if (!settingsLoading && !settingsDoc) {
      // Initialize with defaults if document doesn't exist
      setSettingsForm({
        groceryDuesDefault: String(defaultSettings.groceryDuesDefault),
        houseFundDuesDefault: String(defaultSettings.houseFundDuesDefault),
        utilityLineItems: defaultSettings.utilityLineItems,
        housePassword: defaultSettings.housePassword,
      });
    }
  }, [settingsDoc, settingsLoading]);

  // Initialize housemate form with shared cost shares when editing
  useMemo(() => {
    if (editingHousemate) {
      const shares: Record<string, string> = {};
      // Only initialize shares for costs that use the "shares" split method
      activeSharedCosts.forEach((sc) => {
        if (sc.splitMethod === "shares") {
          shares[sc.id] = String(editingHousemate.sharedCostShares[sc.id] ?? 0);
        }
      });
      setHousemateForm({
        name: editingHousemate.name,
        roomRent: String(editingHousemate.roomRent),
        active: editingHousemate.active,
        sharedCostShares: shares,
      });
    } else {
      const shares: Record<string, string> = {};
      // Only initialize shares for costs that use the "shares" split method
      activeSharedCosts.forEach((sc) => {
        if (sc.splitMethod === "shares") {
          shares[sc.id] = "0";
        }
      });
      setHousemateForm({ ...emptyHousemateForm, sharedCostShares: shares });
    }
  }, [editingHousemate, activeSharedCosts]);

  // Initialize shared cost form when editing
  useMemo(() => {
    if (editingSharedCost) {
      setSharedCostForm({
        name: editingSharedCost.name,
        totalCost: String(editingSharedCost.totalCost),
        splitMethod: editingSharedCost.splitMethod,
      });
    } else {
      setSharedCostForm(emptySharedCostForm);
    }
  }, [editingSharedCost]);

  async function handleHousemateSubmit() {
    setHousemateFormError(null);
    if (!housemateForm.name.trim()) {
      setHousemateFormError("Name is required.");
      return;
    }
    const rentNumber = Number(housemateForm.roomRent);
    if (!Number.isFinite(rentNumber) || rentNumber <= 0) {
      setHousemateFormError("Room rent must be a positive number.");
      return;
    }

    const shares: Record<string, number> = {};
    Object.entries(housemateForm.sharedCostShares).forEach(
      ([costId, shareStr]) => {
        // Only save shares for costs that use the "shares" split method
        const cost = sharedCosts.find((sc) => sc.id === costId);
        if (cost && cost.splitMethod === "shares") {
          const shareNum = Number(shareStr);
          if (Number.isFinite(shareNum) && shareNum >= 0) {
            shares[costId] = shareNum;
          }
        }
      }
    );

    try {
      if (editingHousemate) {
        await updateDocument("housemates", editingHousemate.id, {
          name: housemateForm.name.trim(),
          roomRent: rentNumber,
          active: housemateForm.active,
          sharedCostShares: shares,
        } as Record<string, unknown>);
      } else {
        await addDocument<Omit<Housemate, "id" | "createdAt">>("housemates", {
          name: housemateForm.name.trim(),
          roomRent: rentNumber,
          active: housemateForm.active,
          sharedCostShares: shares,
        });
      }
      setHousemateForm(emptyHousemateForm);
      setEditingHousemateId(null);
    } catch (err) {
      setHousemateFormError(
        err instanceof Error ? err.message : "Failed to save housemate."
      );
    }
  }

  async function handleSharedCostSubmit() {
    setSharedCostFormError(null);
    if (!sharedCostForm.name.trim()) {
      setSharedCostFormError("Name is required.");
      return;
    }
    const costNumber = Number(sharedCostForm.totalCost);
    if (!Number.isFinite(costNumber) || costNumber <= 0) {
      setSharedCostFormError("Total cost must be a positive number.");
      return;
    }

    try {
      if (editingSharedCost) {
        await updateDocument("sharedCosts", editingSharedCost.id, {
          name: sharedCostForm.name.trim(),
          totalCost: costNumber,
          splitMethod: sharedCostForm.splitMethod,
        } as Record<string, unknown>);
      } else {
        await addDocument<Omit<SharedCost, "id" | "createdAt">>("sharedCosts", {
          name: sharedCostForm.name.trim(),
          totalCost: costNumber,
          splitMethod: sharedCostForm.splitMethod,
          active: true,
        });
      }
      setSharedCostForm(emptySharedCostForm);
      setEditingSharedCostId(null);
    } catch (err) {
      setSharedCostFormError(
        err instanceof Error ? err.message : "Failed to save shared cost."
      );
    }
  }

  async function handleSettingsSave() {
    setSavingSettings(true);
    try {
      const groceryDues = Number(settingsForm.groceryDuesDefault);
      const houseFundDues = Number(settingsForm.houseFundDuesDefault);
      if (!Number.isFinite(groceryDues) || groceryDues < 0) {
        throw new Error("Grocery dues must be a non-negative number.");
      }
      if (!Number.isFinite(houseFundDues) || houseFundDues < 0) {
        throw new Error("House fund dues must be a non-negative number.");
      }

      await setDocument("config", "settings", {
        groceryDuesDefault: groceryDues,
        houseFundDuesDefault: houseFundDues,
        utilityLineItems: settingsForm.utilityLineItems,
        housePassword: settingsForm.housePassword,
      } as Record<string, unknown>);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  function addUtilityItem() {
    if (
      newUtilityItem.trim() &&
      !settingsForm.utilityLineItems.includes(newUtilityItem.trim())
    ) {
      setSettingsForm((f) => ({
        ...f,
        utilityLineItems: [...f.utilityLineItems, newUtilityItem.trim()],
      }));
      setNewUtilityItem("");
    }
  }

  function removeUtilityItem(item: string) {
    setSettingsForm((f) => ({
      ...f,
      utilityLineItems: f.utilityLineItems.filter((i) => i !== item),
    }));
  }

  async function toggleSharedCostActive(sc: SharedCost) {
    await updateDocument("sharedCosts", sc.id, {
      active: !sc.active,
    } as Record<string, unknown>);
  }

  async function toggleHousemateActive(h: Housemate) {
    await updateDocument("housemates", h.id, { active: !h.active } as Record<
      string,
      unknown
    >);
  }

  function openArchiveForm(h: Housemate) {
    setArchiveError(null);
    // Default last month to most recent existing month, or current month
    const defaultLastMonth =
      months.length > 0 ? months[0]!.monthKey : format(new Date(), "yyyy-MM");
    setArchiveForm({
      mode: "transition",
      lastMonthKey: defaultLastMonth,
    });
    setArchivingHousemateId(h.id);
  }

  async function handleArchiveSubmit() {
    if (!archivingHousemate) return;
    setArchiveError(null);

    const transitionMonthKey =
      archiveForm.mode === "transition" ? archiveForm.lastMonthKey : null;

    setArchiveSubmitting(true);
    try {
      // 1. Update housemate doc
      const housemateUpdate: Record<string, unknown> = {
        archived: true,
        active: false,
      };
      if (transitionMonthKey) {
        housemateUpdate.lastMonthKey = transitionMonthKey;
      }
      await updateDocument(
        "housemates",
        archivingHousemate.id,
        housemateUpdate
      );

      // 2. If transition month exists and the housemate is in its snapshot,
      //    mark the snapshot as transitionOut so the month editor / rent
      //    page show partial billing.
      if (transitionMonthKey) {
        const targetMonth = months.find(
          (m) => m.monthKey === transitionMonthKey
        );
        if (targetMonth && targetMonth.housemateSnapshots[archivingHousemate.id]) {
          const updatedSnapshots = {
            ...targetMonth.housemateSnapshots,
            [archivingHousemate.id]: {
              ...targetMonth.housemateSnapshots[archivingHousemate.id]!,
              transitionOut: true,
            },
          };
          await updateDocument("months", targetMonth.id, {
            housemateSnapshots: updatedSnapshots,
          } as Record<string, unknown>);
        }
      }

      setArchivingHousemateId(null);
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Failed to archive housemate."
      );
    } finally {
      setArchiveSubmitting(false);
    }
  }

  async function handleUnarchive(h: Housemate) {
    if (
      !confirm(
        `Unarchive ${h.name}? They'll be reactivated and added to new months going forward. Existing months won't be changed automatically.`
      )
    )
      return;

    try {
      // Clear archive fields and reactivate
      await updateDocument("housemates", h.id, {
        archived: false,
        active: true,
        lastMonthKey: null,
      } as Record<string, unknown>);

      // Remove transitionOut from any snapshots referencing this housemate
      // (in their previously-set lastMonthKey, if any)
      if (h.lastMonthKey) {
        const targetMonth = months.find((m) => m.monthKey === h.lastMonthKey);
        if (
          targetMonth &&
          targetMonth.housemateSnapshots[h.id]?.transitionOut
        ) {
          const existing = targetMonth.housemateSnapshots[h.id]!;
          const { transitionOut: _omit, ...rest } = existing;
          const updatedSnapshots = {
            ...targetMonth.housemateSnapshots,
            [h.id]: rest,
          };
          await updateDocument("months", targetMonth.id, {
            housemateSnapshots: updatedSnapshots,
          } as Record<string, unknown>);
        }
      }
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to unarchive housemate."
      );
    }
  }

  // ─── Payouts ────────────────────────────────────────────────────────────
  // Detect pending payouts: a housemate's transitionOut month ended with a
  // negative grandTotal (their receipts exceeded what they owed) AND no
  // payout has been recorded yet.
  interface PendingPayout {
    housemate: Housemate;
    monthKey: string;
    amount: number; // Positive — what the house owes them.
  }

  const pendingPayouts = useMemo<PendingPayout[]>(() => {
    if (!months || !housemates || !receipts || !sharedCosts) return [];
    const pending: PendingPayout[] = [];

    for (const month of months) {
      for (const [housemateId, snap] of Object.entries(
        month.housemateSnapshots
      )) {
        if (!snap.transitionOut) continue;
        const housemate = housemates.find((h) => h.id === housemateId);
        if (!housemate) continue;

        const dues = calculateHousemateDues({
          housemate,
          monthRecord: month,
          receipts,
          sharedCosts,
          allHousemates: housemates,
        });
        if (dues.grandTotal >= 0) continue;

        // Already paid out?
        const alreadyPaid = payouts.some(
          (p) =>
            p.housemateId === housemateId && p.monthKey === month.monthKey
        );
        if (alreadyPaid) continue;

        pending.push({
          housemate,
          monthKey: month.monthKey,
          amount: Math.round(-dues.grandTotal * 100) / 100,
        });
      }
    }
    return pending;
  }, [months, housemates, receipts, sharedCosts, payouts]);

  const [payoutFormFor, setPayoutFormFor] = useState<{
    housemateId: string;
    monthKey: string;
    amount: number;
  } | null>(null);
  const [payoutForm, setPayoutForm] = useState({
    paidDate: format(new Date(), "yyyy-MM-dd"),
    note: "",
  });
  const [recordingPayout, setRecordingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  function openPayoutForm(pending: PendingPayout) {
    setPayoutError(null);
    setPayoutForm({
      paidDate: format(new Date(), "yyyy-MM-dd"),
      note: "",
    });
    setPayoutFormFor({
      housemateId: pending.housemate.id,
      monthKey: pending.monthKey,
      amount: pending.amount,
    });
  }

  async function handleRecordPayout() {
    if (!payoutFormFor) return;
    setPayoutError(null);

    // Parse the date string as a local midnight Date.
    const [yyyy, mm, dd] = payoutForm.paidDate.split("-").map(Number);
    if (!yyyy || !mm || !dd) {
      setPayoutError("Invalid date.");
      return;
    }
    const paidDate = new Date(yyyy, mm - 1, dd);

    setRecordingPayout(true);
    try {
      await addDocument<Omit<Payout, "id" | "createdAt">>("payouts", {
        housemateId: payoutFormFor.housemateId,
        monthKey: payoutFormFor.monthKey,
        amount: payoutFormFor.amount,
        fund: "house",
        paidDate: Timestamp.fromDate(paidDate),
        ...(payoutForm.note.trim() ? { note: payoutForm.note.trim() } : {}),
      });
      setPayoutFormFor(null);
    } catch (err) {
      setPayoutError(
        err instanceof Error ? err.message : "Failed to record payout."
      );
    } finally {
      setRecordingPayout(false);
    }
  }

  // Month management functions
  function getNextMonthKey(): string {
    if (months.length === 0) {
      // No months exist, create next month (month after current)
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return format(nextMonth, "yyyy-MM");
    }

    // Get the latest month (already sorted descending by monthKey) and add one month
    const latest = months[0]!;
    const latestMonthKey = latest.monthKey;
    const [year, month] = latestMonthKey.split("-").map(Number);
    // month is 1-12, but Date constructor expects 0-11, so subtract 1
    const nextDate = new Date(year, month - 1, 1);
    nextDate.setMonth(nextDate.getMonth() + 1); // Add one month
    return format(nextDate, "yyyy-MM");
  }

  async function handleCreateMonth() {
    const nextMonthKey = getNextMonthKey();

    // Check if month already exists
    if (months.some((m) => m.monthKey === nextMonthKey)) {
      alert(`Month ${nextMonthKey} already exists.`);
      return;
    }

    setCreatingMonth(true);
    try {
      // Exclude archived housemates from new month snapshots.
      // Their lastMonthKey marks their final billing month — anything after that
      // they're fully gone.
      const eligibleHousematesList = housemates.filter(
        (h) => h.active && !h.archived
      );

      // Determine prior month for credit seeding. `months` is sorted desc by
      // monthKey, so months[0] is the latest existing month.
      const priorMonth = months[0];

      const housemateSnapshots: Record<
        string,
        {
          paid: PaidStatus;
          feeAdjustment: number;
          creditFromPriorMonth?: number;
        }
      > = {};

      eligibleHousematesList.forEach((h) => {
        const snapshot: {
          paid: PaidStatus;
          feeAdjustment: number;
          creditFromPriorMonth?: number;
        } = {
          paid: "unpaid",
          feeAdjustment: 0,
        };

        // Seed credit if this housemate had a negative grandTotal in the
        // prior month. We exclude transitionOut housemates (they get paid
        // out manually via the payouts flow, not rolled forward).
        if (priorMonth) {
          const priorSnap = priorMonth.housemateSnapshots[h.id];
          if (priorSnap && !priorSnap.transitionOut) {
            const priorDues = calculateHousemateDues({
              housemate: h,
              monthRecord: priorMonth,
              receipts,
              sharedCosts,
              allHousemates: housemates,
            });
            if (priorDues.grandTotal < 0) {
              // Round to cents and store as positive credit.
              snapshot.creditFromPriorMonth =
                Math.round(-priorDues.grandTotal * 100) / 100;
            }
          }
        }

        housemateSnapshots[h.id] = snapshot;
      });

      const utilities: Record<string, number> = {};
      const utilityItems =
        settingsDoc?.utilityLineItems ?? defaultSettings.utilityLineItems;
      utilityItems.forEach((item) => {
        utilities[item] = 0;
      });

      await setDocument<Omit<MonthRecord, "id" | "createdAt">>(
        "months",
        nextMonthKey,
        {
          monthKey: nextMonthKey,
          utilities,
          groceryDues:
            settingsDoc?.groceryDuesDefault ??
            defaultSettings.groceryDuesDefault,
          houseFundDues:
            settingsDoc?.houseFundDuesDefault ??
            defaultSettings.houseFundDuesDefault,
          housemateSnapshots,
        }
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create month.");
    } finally {
      setCreatingMonth(false);
    }
  }

  function getMonthStatus(m: MonthRecord) {
    const utilitiesEntered = Object.values(m.utilities).some((v) => v > 0);
    const paidCount = Object.values(m.housemateSnapshots).filter(
      (s) => s.paid === "paid"
    ).length;
    const partialCount = Object.values(m.housemateSnapshots).filter(
      (s) => s.paid === "partial"
    ).length;
    const unpaidCount = Object.values(m.housemateSnapshots).filter(
      (s) => s.paid === "unpaid"
    ).length;
    return { utilitiesEntered, paidCount, partialCount, unpaidCount };
  }

  return (
    <PageShell title="Admin">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("housemates")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "housemates"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Housemates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "settings"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shared-costs")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "shared-costs"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Shared Costs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("months")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "months"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Months
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fund-balances")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "fund-balances"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Fund Balances
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("payouts")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "payouts"
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Payouts
            {pendingPayouts.length > 0 && (
              <span className="ml-2 inline-block rounded-full bg-amber-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                {pendingPayouts.length} pending
              </span>
            )}
          </button>
        </div>

        {/* Housemates Tab */}
        {activeTab === "housemates" && (
          <>
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-50">
                Housemates
              </h2>

              {housematesLoading && (
                <p className="text-sm text-slate-400">Loading housemates…</p>
              )}
              {housematesError && (
                <p className="text-sm text-red-400">
                  {getFirestoreErrorMessage(housematesError)}
                </p>
              )}

              {!housematesLoading &&
                !housematesError &&
                housemates.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No housemates yet. Use the form below to add some.
                  </p>
                )}

              {housemates.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Room Rent</th>
                        <th className="px-3 py-2">Active</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {housemates.map((h) => {
                        const statusLabel = h.archived
                          ? "Archived"
                          : h.active
                            ? "Active"
                            : "Inactive";
                        const statusClass = h.archived
                          ? "bg-amber-900/60 text-amber-200"
                          : h.active
                            ? "bg-emerald-900/60 text-emerald-200"
                            : "bg-slate-800 text-slate-300";
                        return (
                          <tr key={h.id} className="border-t border-slate-800">
                            <td className="px-3 py-2">
                              {h.name}
                              {h.archived && h.lastMonthKey && (
                                <span className="ml-2 text-xs text-slate-400">
                                  (last: {formatMonthKey(h.lastMonthKey)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              ${h.roomRent.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              {h.archived ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                                >
                                  {statusLabel}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleHousemateActive(h)}
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                                >
                                  {statusLabel}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={() => setEditingHousemateId(h.id)}
                                  className="text-xs font-medium text-sky-300 hover:text-sky-200"
                                >
                                  Edit
                                </button>
                                {h.archived ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleUnarchive(h)}
                                    className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                                  >
                                    Unarchive
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openArchiveForm(h)}
                                    className="text-xs font-medium text-amber-300 hover:text-amber-200"
                                  >
                                    Archive
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Archive form */}
            {archivingHousemate && (
              <section className="border-t border-slate-800 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Archive {archivingHousemate.name}
                </h3>
                <p className="mb-3 text-xs text-slate-400">
                  Archived housemates won't appear in newly created months.
                  Existing months are preserved as historical records.
                </p>
                {archiveError && (
                  <p className="mb-2 text-xs font-medium text-red-400">
                    {archiveError}
                  </p>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Final billing month
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 text-xs text-slate-200">
                        <input
                          type="radio"
                          name="archive-mode"
                          checked={archiveForm.mode === "transition"}
                          onChange={() =>
                            setArchiveForm((f) => ({
                              ...f,
                              mode: "transition",
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">
                            Transition out in a specific month
                          </span>
                          <span className="ml-1 text-slate-400">
                            — they'll be billed only for utilities, receipts,
                            and chores that month (no room rent, dues, or
                            shared costs).
                          </span>
                        </span>
                      </label>
                      {archiveForm.mode === "transition" && (
                        <div className="ml-6">
                          <select
                            value={archiveForm.lastMonthKey}
                            onChange={(e) =>
                              setArchiveForm((f) => ({
                                ...f,
                                lastMonthKey: e.target.value,
                              }))
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                          >
                            {months.map((m) => (
                              <option key={m.monthKey} value={m.monthKey}>
                                {formatMonthKey(m.monthKey)}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-slate-500">
                            If they're in this month's snapshot, it'll be
                            updated to reflect partial billing.
                          </p>
                        </div>
                      )}
                      <label className="flex items-start gap-2 text-xs text-slate-200">
                        <input
                          type="radio"
                          name="archive-mode"
                          checked={archiveForm.mode === "immediate"}
                          onChange={() =>
                            setArchiveForm((f) => ({
                              ...f,
                              mode: "immediate",
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">
                            Archive without a transition month
                          </span>
                          <span className="ml-1 text-slate-400">
                            — they're fully gone. Existing months untouched;
                            new months exclude them.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleArchiveSubmit()}
                      disabled={archiveSubmitting}
                      className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {archiveSubmitting
                        ? "Archiving..."
                        : `Archive ${archivingHousemate.name}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchivingHousemateId(null)}
                      className="text-sm font-medium text-slate-300 hover:text-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="border-t border-slate-800 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">
                {editingHousemate ? "Edit housemate" : "Add new housemate"}
              </h3>
              {housemateFormError && (
                <p className="mb-2 text-xs font-medium text-red-400">
                  {housemateFormError}
                </p>
              )}
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Name
                    </label>
                    <input
                      type="text"
                      value={housemateForm.name}
                      onChange={(e) =>
                        setHousemateForm((f) => ({
                          ...f,
                          name: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Room rent ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={housemateForm.roomRent}
                      onChange={(e) =>
                        setHousemateForm((f) => ({
                          ...f,
                          roomRent: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
                      <input
                        type="checkbox"
                        checked={housemateForm.active}
                        onChange={(e) =>
                          setHousemateForm((f) => ({
                            ...f,
                            active: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-400"
                      />
                      Active
                    </label>
                  </div>
                </div>

                {/* Shared Cost Shares */}
                {activeSharedCosts.length > 0 && (
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Shared Cost Shares
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {activeSharedCosts.map((sc) => {
                        if (sc.splitMethod === "even") {
                          return (
                            <div
                              key={sc.id}
                              className="flex items-center gap-2"
                            >
                              <label className="flex-1 text-xs text-slate-300">
                                {sc.name}:
                              </label>
                              <span className="text-xs text-slate-400 italic">
                                Even split
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div key={sc.id} className="flex items-center gap-2">
                            <label className="flex-1 text-xs text-slate-300">
                              {sc.name}:
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={
                                housemateForm.sharedCostShares[sc.id] ?? "0"
                              }
                              onChange={(e) =>
                                setHousemateForm((f) => ({
                                  ...f,
                                  sharedCostShares: {
                                    ...f.sharedCostShares,
                                    [sc.id]: e.target.value,
                                  },
                                }))
                              }
                              className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                              placeholder="0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleHousemateSubmit()}
                    className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                  >
                    {editingHousemate ? "Save changes" : "Add housemate"}
                  </button>
                  {editingHousemate && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingHousemateId(null);
                        setHousemateForm(emptyHousemateForm);
                      }}
                      className="text-sm font-medium text-slate-300 hover:text-slate-100"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-50">
              Settings
            </h2>

            {settingsLoading && (
              <p className="text-sm text-slate-400">Loading settings…</p>
            )}
            {settingsError && (
              <p className="text-sm text-red-400">
                {getFirestoreErrorMessage(settingsError)}
              </p>
            )}

            {!settingsLoading && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Grocery Dues Default ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={settingsForm.groceryDuesDefault}
                      onChange={(e) =>
                        setSettingsForm((f) => ({
                          ...f,
                          groceryDuesDefault: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      House Fund Dues Default ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={settingsForm.houseFundDuesDefault}
                      onChange={(e) =>
                        setSettingsForm((f) => ({
                          ...f,
                          houseFundDuesDefault: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Utility Line Items
                  </label>
                  <div className="space-y-2">
                    {settingsForm.utilityLineItems.map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100">
                          {item}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeUtilityItem(item)}
                          className="text-xs font-medium text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newUtilityItem}
                        onChange={(e) => setNewUtilityItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addUtilityItem();
                          }
                        }}
                        placeholder="e.g., internet, water, electric"
                        className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                      />
                      <button
                        type="button"
                        onClick={addUtilityItem}
                        className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    House Password
                  </label>
                  <input
                    type="password"
                    value={settingsForm.housePassword}
                    onChange={(e) =>
                      setSettingsForm((f) => ({
                        ...f,
                        housePassword: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                    placeholder="Password for app access"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleSettingsSave()}
                  disabled={savingSettings}
                  className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingSettings ? "Saving…" : "Save Settings"}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Shared Costs Tab */}
        {activeTab === "shared-costs" && (
          <>
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-50">
                Shared Costs
              </h2>

              {sharedCostsLoading && (
                <p className="text-sm text-slate-400">Loading shared costs…</p>
              )}
              {sharedCostsError && (
                <p className="text-sm text-red-400">
                  {getFirestoreErrorMessage(sharedCostsError)}
                </p>
              )}

              {!sharedCostsLoading &&
                !sharedCostsError &&
                sharedCosts.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No shared costs yet. Use the form below to add some.
                  </p>
                )}

              {sharedCosts.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Total Cost</th>
                        <th className="px-3 py-2">Split Method</th>
                        <th className="px-3 py-2">Active</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedCosts.map((sc) => (
                        <tr key={sc.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{sc.name}</td>
                          <td className="px-3 py-2">
                            ${sc.totalCost.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-slate-300">
                              {sc.splitMethod === "shares"
                                ? "By Shares"
                                : "Even Split"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleSharedCostActive(sc)}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                sc.active
                                  ? "bg-emerald-900/60 text-emerald-200"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {sc.active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditingSharedCostId(sc.id)}
                              className="text-xs font-medium text-sky-300 hover:text-sky-200"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="border-t border-slate-800 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">
                {editingSharedCost ? "Edit shared cost" : "Add new shared cost"}
              </h3>
              {sharedCostFormError && (
                <p className="mb-2 text-xs font-medium text-red-400">
                  {sharedCostFormError}
                </p>
              )}
              <form noValidate className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Name
                  </label>
                  <input
                    type="text"
                    value={sharedCostForm.name}
                    onChange={(e) =>
                      setSharedCostForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Total Cost ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={sharedCostForm.totalCost}
                    onChange={(e) =>
                      setSharedCostForm((f) => ({
                        ...f,
                        totalCost: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    Split Method
                  </label>
                  <select
                    value={sharedCostForm.splitMethod}
                    onChange={(e) =>
                      setSharedCostForm((f) => ({
                        ...f,
                        splitMethod: e.target.value as SharedCostSplitMethod,
                      }))
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                  >
                    <option value="even">Even Split</option>
                    <option value="shares">By Shares</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSharedCostSubmit()}
                    className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                  >
                    {editingSharedCost ? "Save changes" : "Add shared cost"}
                  </button>
                  {editingSharedCost && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSharedCostId(null);
                        setSharedCostForm(emptySharedCostForm);
                      }}
                      className="text-sm font-medium text-slate-300 hover:text-slate-100"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </section>
          </>
        )}

        {/* Months Tab */}
        {activeTab === "months" && (
          <>
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-50">Months</h2>
                <button
                  type="button"
                  onClick={() => void handleCreateMonth()}
                  disabled={creatingMonth}
                  className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {creatingMonth ? "Creating..." : "Create Next Month"}
                </button>
              </div>

              {monthsLoading && (
                <p className="text-sm text-slate-400">Loading months…</p>
              )}
              {monthsError && (
                <p className="text-sm text-red-400">
                  {getFirestoreErrorMessage(monthsError)}
                </p>
              )}

              {!monthsLoading && !monthsError && months.length === 0 && (
                <p className="text-sm text-slate-400">
                  No months created yet. Click "Create Next Month" to get
                  started.
                </p>
              )}

              {months.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2">Utilities</th>
                        <th className="px-3 py-2">Finalized</th>
                        <th className="px-3 py-2">Paid</th>
                        <th className="px-3 py-2">Partial</th>
                        <th className="px-3 py-2">Unpaid</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => {
                        const status = getMonthStatus(m);
                        return (
                          <tr key={m.id} className="border-t border-slate-800">
                            <td className="px-3 py-2 font-medium text-slate-100">
                              {(() => {
                                const [year, month] = m.monthKey
                                  .split("-")
                                  .map(Number);
                                return format(
                                  new Date(year, month - 1, 1),
                                  "MMMM yyyy"
                                );
                              })()}
                            </td>
                            <td className="px-3 py-2">
                              {status.utilitiesEntered ? (
                                <span className="text-xs text-emerald-300">
                                  ✓ Entered
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Not entered
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isMonthFinalized(m.monthKey) ? (
                                <span className="text-xs font-semibold text-emerald-300">
                                  ✓ Finalized
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Open
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {status.paidCount}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {status.partialCount}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {status.unpaidCount}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => setEditingMonthId(m.id)}
                                className="text-xs font-medium text-sky-300 hover:text-sky-200"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Edit Month Section */}
            {editingMonthId && (
              <MonthEditForm
                month={months.find((m) => m.id === editingMonthId)!}
                housemates={housemates}
                settings={settingsDoc ?? defaultSettings}
                onClose={() => setEditingMonthId(null)}
                onSave={async (updates) => {
                  await updateDocument(
                    "months",
                    editingMonthId,
                    updates as Record<string, unknown>
                  );
                  setEditingMonthId(null);
                }}
              />
            )}
          </>
        )}

        {/* Fund Balances Tab */}
        {activeTab === "fund-balances" && (
          <>
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-50">
                Initial Fund Balances
              </h2>
              <p className="mb-4 text-sm text-slate-400">
                Set the starting balances for your funds when migrating from a
                previous system. These balances represent the funds you had
                before starting to track with this system. All monthly changes
                will be calculated on top of these initial balances.
              </p>

              {fundBalancesLoading && (
                <p className="text-sm text-slate-400">Loading balances…</p>
              )}
              {fundBalancesDocError && (
                <p className="text-sm text-red-400">
                  {getFirestoreErrorMessage(fundBalancesDocError)}
                </p>
              )}

              {!fundBalancesLoading && !fundBalancesDocError && (
                <div className="space-y-4">
                  {fundBalancesFormError && (
                    <div className="rounded-md bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-200">
                      {fundBalancesFormError}
                    </div>
                  )}

                  {fundBalancesSuccess && (
                    <div className="rounded-md bg-emerald-900/30 border border-emerald-800 px-3 py-2 text-sm text-emerald-200">
                      {fundBalancesSuccess}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Initial Grocery Fund Balance ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fundBalancesForm.initialGroceryBalance}
                        onChange={(e) =>
                          setFundBalancesForm((f) => ({
                            ...f,
                            initialGroceryBalance: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Starting balance from previous system
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Initial House Fund Balance ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fundBalancesForm.initialHouseBalance}
                        onChange={(e) =>
                          setFundBalancesForm((f) => ({
                            ...f,
                            initialHouseBalance: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Starting balance from previous system
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Initial Chore Fund Balance ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fundBalancesForm.initialChoreBalance}
                        onChange={(e) =>
                          setFundBalancesForm((f) => ({
                            ...f,
                            initialChoreBalance: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Starting balance from previous system
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveFundBalances()}
                      disabled={savingFundBalances}
                      className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingFundBalances
                        ? "Saving..."
                        : "Save Initial Balances"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* Payouts Tab */}
        {activeTab === "payouts" && (
          <section className="space-y-6">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-50">
                Payouts
              </h2>
              <p className="text-sm text-slate-400">
                When a housemate moves out with more receipts than rent owed,
                the house owes them the difference. Pay them manually (Venmo,
                cash, etc.) from the house fund, then record it here so the
                balance is tracked.
              </p>
            </div>

            {/* Pending payouts */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Pending ({pendingPayouts.length})
              </h3>
              {pendingPayouts.length === 0 ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                  No pending payouts.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingPayouts.map((p) => {
                    const isOpen =
                      payoutFormFor?.housemateId === p.housemate.id &&
                      payoutFormFor?.monthKey === p.monthKey;
                    return (
                      <div
                        key={`${p.housemate.id}-${p.monthKey}`}
                        className="rounded-md border border-amber-800/60 bg-amber-900/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-amber-100">
                              {p.housemate.name}
                            </div>
                            <div className="text-xs text-amber-200/80">
                              Final month: {formatMonthKey(p.monthKey)}
                            </div>
                            <div className="mt-1 text-sm text-slate-300">
                              House owes:{" "}
                              <span className="font-semibold text-emerald-300">
                                {formatCurrency(p.amount)}
                              </span>
                            </div>
                          </div>
                          {!isOpen && (
                            <button
                              type="button"
                              onClick={() => openPayoutForm(p)}
                              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                            >
                              Record payout
                            </button>
                          )}
                        </div>

                        {isOpen && (
                          <div className="mt-4 space-y-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                            {payoutError && (
                              <div className="rounded-md bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-200">
                                {payoutError}
                              </div>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                                  Date paid
                                </label>
                                <input
                                  type="date"
                                  value={payoutForm.paidDate}
                                  onChange={(e) =>
                                    setPayoutForm((f) => ({
                                      ...f,
                                      paidDate: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                                  Note (optional)
                                </label>
                                <input
                                  type="text"
                                  value={payoutForm.note}
                                  onChange={(e) =>
                                    setPayoutForm((f) => ({
                                      ...f,
                                      note: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Venmo to Alice"
                                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400"
                                />
                              </div>
                            </div>
                            <div className="text-xs text-slate-400">
                              This will deduct{" "}
                              {formatCurrency(p.amount)} from the house fund.
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleRecordPayout()}
                                disabled={recordingPayout}
                                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {recordingPayout
                                  ? "Saving..."
                                  : "Confirm payout"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayoutFormFor(null)}
                                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* History */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                History
              </h3>
              {payouts.length === 0 ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                  No payouts recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Housemate</th>
                        <th className="px-3 py-2">Final month</th>
                        <th className="px-3 py-2">Paid</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => {
                        const housemate = housemates.find(
                          (h) => h.id === p.housemateId
                        );
                        return (
                          <tr
                            key={p.id}
                            className="border-t border-slate-800"
                          >
                            <td className="px-3 py-2 font-medium text-slate-200">
                              {housemate?.name ?? "(unknown)"}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {formatMonthKey(p.monthKey)}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {formatDate(p.paidDate.toDate())}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-300">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="px-3 py-2 text-slate-400">
                              {p.note ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

// Month Edit Form Component
function MonthEditForm({
  month,
  housemates,
  settings,
  onClose,
  onSave,
}: {
  month: MonthRecord;
  housemates: Housemate[];
  settings: Settings;
  onClose: () => void;
  onSave: (updates: Partial<MonthRecord>) => Promise<void>;
}) {
  const [utilities, setUtilities] = useState<Record<string, string>>({});
  const [groceryDues, setGroceryDues] = useState("");
  const [houseFundDues, setHouseFundDues] = useState("");
  const [snapshots, setSnapshots] = useState<
    Record<
      string,
      {
        paid: PaidStatus;
        feeAdjustment: string;
        partialPaidAmount: string;
        transitionOut: boolean;
        transitionIn: boolean;
      }
    >
  >({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get calculation results for validation
  const { summary: calculationSummary, loading: calculationLoading } =
    useMonthCalculations(month.monthKey);

  // Initialize form from month data
  useEffect(() => {
    const utils: Record<string, string> = {};
    Object.entries(month.utilities).forEach(([key, value]) => {
      utils[key] = String(value);
    });
    setUtilities(utils);

    setGroceryDues(String(month.groceryDues));
    setHouseFundDues(String(month.houseFundDues));

    const snaps: Record<
      string,
      {
        paid: PaidStatus;
        feeAdjustment: string;
        partialPaidAmount: string;
        transitionOut: boolean;
        transitionIn: boolean;
      }
    > = {};
    Object.entries(month.housemateSnapshots).forEach(([id, snap]) => {
      snaps[id] = {
        paid: snap.paid,
        feeAdjustment: String(snap.feeAdjustment),
        partialPaidAmount:
          snap.partialPaidAmount != null ? String(snap.partialPaidAmount) : "",
        transitionOut: snap.transitionOut === true,
        transitionIn: snap.transitionIn === true,
      };
    });
    setSnapshots(snaps);
  }, [month]);

  const totalUtilities = useMemo(() => {
    return Object.values(utilities).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
  }, [utilities]);

  const snapshotHousemateCount = Object.keys(month.housemateSnapshots).length;
  const perPersonUtilityShare =
    snapshotHousemateCount > 0 ? totalUtilities / snapshotHousemateCount : 0;

  async function handleSave() {
    setError(null);

    const groceryDuesNum = Number(groceryDues);
    const houseFundDuesNum = Number(houseFundDues);

    if (!Number.isFinite(groceryDuesNum) || groceryDuesNum < 0) {
      setError("Grocery dues must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(houseFundDuesNum) || houseFundDuesNum < 0) {
      setError("House fund dues must be a non-negative number.");
      return;
    }

    const utils: Record<string, number> = {};
    Object.entries(utilities).forEach(([key, value]) => {
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) {
        utils[key] = num;
      }
    });

    const updatedSnapshots: Record<
      string,
      {
        paid: PaidStatus;
        feeAdjustment: number;
        partialPaidAmount?: number;
        transitionOut?: boolean;
        transitionIn?: boolean;
        creditFromPriorMonth?: number;
      }
    > = {};
    Object.entries(snapshots).forEach(([id, snap]) => {
      const feeAdj = Number(snap.feeAdjustment);

      const entry: {
        paid: PaidStatus;
        feeAdjustment: number;
        partialPaidAmount?: number;
        transitionOut?: boolean;
        transitionIn?: boolean;
        creditFromPriorMonth?: number;
      } = {
        paid: snap.paid,
        feeAdjustment: Number.isFinite(feeAdj) ? feeAdj : 0,
      };
      // Only persist the partial payment amount for partial payments, and only
      // when a valid number was entered. Avoids writing undefined to Firestore.
      if (snap.paid === "partial" && snap.partialPaidAmount.trim() !== "") {
        const partialNum = Number(snap.partialPaidAmount);
        if (Number.isFinite(partialNum) && partialNum >= 0) {
          entry.partialPaidAmount = partialNum;
        }
      }
      if (snap.transitionOut) {
        entry.transitionOut = true;
      }
      if (snap.transitionIn) {
        entry.transitionIn = true;
      }
      // Preserve auto-seeded credit from prior month if present on the
      // original snapshot — it's not yet editable in the UI, but we don't
      // want to silently drop it on save.
      const existing = month.housemateSnapshots[id];
      if (existing?.creditFromPriorMonth) {
        entry.creditFromPriorMonth = existing.creditFromPriorMonth;
      }
      updatedSnapshots[id] = entry;
    });

    setSaving(true);
    try {
      await onSave({
        utilities: utils,
        groceryDues: groceryDuesNum,
        houseFundDues: houseFundDuesNum,
        housemateSnapshots: updatedSnapshots,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save month.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-slate-800 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-50">
          Edit{" "}
          {(() => {
            const [year, monthNum] = month.monthKey.split("-").map(Number);
            return formatMonthKey(month.monthKey);
          })()}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-300 hover:text-slate-100"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Utilities */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-200">
            Utilities
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {settings.utilityLineItems.map((item) => (
              <div key={item}>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  {item} ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={utilities[item] ?? "0"}
                  onChange={(e) =>
                    setUtilities((u) => ({ ...u, [item]: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
                />
              </div>
            ))}
          </div>
          {totalUtilities > 0 && (
            <div className="mt-3 text-xs text-slate-400">
              Total utilities: {formatCurrency(totalUtilities)} | Per person:{" "}
              {formatCurrency(perPersonUtilityShare)}
            </div>
          )}
        </div>

        {/* Dues */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Grocery Dues ($)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={groceryDues}
              onChange={(e) => setGroceryDues(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              House Fund Dues ($)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={houseFundDues}
              onChange={(e) => setHouseFundDues(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
            />
          </div>
        </div>

        {/* Housemate Snapshots */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-200">
            Housemate Status
          </h4>
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Paid Status</th>
                  <th
                    className="px-3 py-2"
                    title="Dollar amount paid so far. Only editable when Paid Status is Partial."
                  >
                    Partial Paid ($)
                  </th>
                  <th className="px-3 py-2">Chores ($)</th>
                  <th
                    className="px-3 py-2"
                    title="Moving in: skips utilities (prior month's bills they weren't here for). Moving out: bills only utilities/receipts/chores — no room rent, dues, or shared costs."
                  >
                    Transition
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(snapshots).map(([housemateId, snap]) => {
                  const housemate = housemates.find(
                    (h) => h.id === housemateId
                  );
                  if (!housemate) return null;
                  const transitionValue = snap.transitionIn
                    ? "in"
                    : snap.transitionOut
                      ? "out"
                      : "none";
                  return (
                    <tr key={housemateId} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-300">
                        {housemate.name}
                        {snap.transitionIn && (
                          <span className="ml-2 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-200">
                            Moving in
                          </span>
                        )}
                        {snap.transitionOut && (
                          <span className="ml-2 rounded-full bg-amber-900/60 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-200">
                            Moving out
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={snap.paid}
                          onChange={(e) =>
                            setSnapshots((s) => ({
                              ...s,
                              [housemateId]: {
                                ...s[housemateId]!,
                                paid: e.target.value as PaidStatus,
                              },
                            }))
                          }
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {snap.paid === "partial" ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={snap.partialPaidAmount}
                            onChange={(e) =>
                              setSnapshots((s) => ({
                                ...s,
                                [housemateId]: {
                                  ...s[housemateId]!,
                                  partialPaidAmount: e.target.value,
                                },
                              }))
                            }
                            className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                            placeholder="0.00"
                          />
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={snap.feeAdjustment}
                          onChange={(e) =>
                            setSnapshots((s) => ({
                              ...s,
                              [housemateId]: {
                                ...s[housemateId]!,
                                feeAdjustment: e.target.value,
                              },
                            }))
                          }
                          className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={transitionValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSnapshots((s) => ({
                              ...s,
                              [housemateId]: {
                                ...s[housemateId]!,
                                transitionIn: v === "in",
                                transitionOut: v === "out",
                              },
                            }));
                          }}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                        >
                          <option value="none">—</option>
                          <option value="in">Moving in</option>
                          <option value="out">Moving out</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSnapshots((s) => {
                              const { [housemateId]: _omit, ...rest } = s;
                              return rest;
                            })
                          }
                          className="text-xs font-medium text-red-300 hover:text-red-200"
                          title="Remove from this month's snapshot"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AddHousemateToSnapshot
            housemates={housemates}
            snapshotIds={Object.keys(snapshots)}
            onAdd={(id, asTransitionIn) =>
              setSnapshots((s) => ({
                ...s,
                [id]: {
                  paid: "unpaid",
                  feeAdjustment: "0",
                  partialPaidAmount: "",
                  transitionOut: false,
                  transitionIn: asTransitionIn,
                },
              }))
            }
          />
        </div>

        {/* Calculation Validation */}
        {calculationSummary && calculationSummary.length > 0 && (
          <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">
              Calculation Results (for validation)
            </h4>
            {calculationLoading ? (
              <p className="text-xs text-slate-400">Calculating...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-900/80 uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2 py-1">Name</th>
                      <th className="px-2 py-1 text-right">Room Rent</th>
                      <th className="px-2 py-1 text-right">Utilities</th>
                      <th className="px-2 py-1 text-right">Grocery</th>
                      <th className="px-2 py-1 text-right">House Fund</th>
                      <th className="px-2 py-1 text-right">Shared</th>
                      <th className="px-2 py-1 text-right">Receipts</th>
                      <th className="px-2 py-1 text-right">Chores</th>
                      <th className="px-2 py-1 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculationSummary.map((item) => (
                      <tr
                        key={item.housemate.id}
                        className="border-t border-slate-800"
                      >
                        <td className="px-2 py-1 text-slate-300">
                          {item.housemate.name}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {formatCurrency(item.dues.roomRent)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {formatCurrency(item.dues.utilities)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {formatCurrency(item.dues.groceryDues)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {formatCurrency(item.dues.houseFundDues)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {formatCurrency(
                            Object.values(item.dues.sharedCosts).reduce(
                              (sum, val) => sum + val,
                              0
                            )
                          )}
                        </td>
                        <td className="px-2 py-1 text-right text-red-300">
                          -{formatCurrency(item.dues.receiptsTotal)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">
                          {item.dues.feeAdjustment !== 0
                            ? formatCurrency(item.dues.feeAdjustment)
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right font-semibold text-slate-100">
                          {formatCurrency(item.dues.grandTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-300 hover:text-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

// Small inline component for adding a missing housemate to a month's snapshot
function AddHousemateToSnapshot({
  housemates,
  snapshotIds,
  onAdd,
}: {
  housemates: Housemate[];
  snapshotIds: string[];
  onAdd: (housemateId: string, asTransitionIn: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [asTransitionIn, setAsTransitionIn] = useState(true);

  // Anyone not already in the snapshot is a candidate. Include archived
  // housemates too (financier might need to add them back retroactively).
  const candidates = useMemo(
    () => housemates.filter((h) => !snapshotIds.includes(h.id)),
    [housemates, snapshotIds]
  );

  if (candidates.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-700 bg-slate-900/30 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Add housemate to this month
      </span>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
      >
        <option value="">Select…</option>
        {candidates.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {h.archived ? " (archived)" : ""}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={asTransitionIn}
          onChange={(e) => setAsTransitionIn(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
        />
        Mark as moving in (skip utilities)
      </label>
      <button
        type="button"
        onClick={() => {
          if (!selectedId) return;
          onAdd(selectedId, asTransitionIn);
          setSelectedId("");
          setAsTransitionIn(true);
        }}
        disabled={!selectedId}
        className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

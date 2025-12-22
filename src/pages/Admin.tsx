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
} from "../lib/types";
import { format } from "date-fns";
import { useMonthCalculations } from "../hooks/useMonthCalculations";
import {
  formatMonthKey,
  formatCurrency,
  formatDate,
  getFirestoreErrorMessage,
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
    "housemates" | "settings" | "shared-costs" | "months"
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

  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [creatingMonth, setCreatingMonth] = useState(false);

  // Settings
  const {
    data: settingsDoc,
    loading: settingsLoading,
    error: settingsError,
  } = useDocument<Settings>("config", "settings");

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
        await updateDocument<Housemate>("housemates", editingHousemate.id, {
          name: housemateForm.name.trim(),
          roomRent: rentNumber,
          active: housemateForm.active,
          sharedCostShares: shares,
        });
      } else {
        await addDocument<Omit<Housemate, "id">>("housemates", {
          name: housemateForm.name.trim(),
          roomRent: rentNumber,
          active: housemateForm.active,
          sharedCostShares: shares,
        } as Omit<Housemate, "id">);
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
        await updateDocument<SharedCost>("sharedCosts", editingSharedCost.id, {
          name: sharedCostForm.name.trim(),
          totalCost: costNumber,
          splitMethod: sharedCostForm.splitMethod,
        });
      } else {
        await addDocument<Omit<SharedCost, "id">>("sharedCosts", {
          name: sharedCostForm.name.trim(),
          totalCost: costNumber,
          splitMethod: sharedCostForm.splitMethod,
          active: true,
        } as Omit<SharedCost, "id">);
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

      await setDocument<Settings>("config", "settings", {
        groceryDuesDefault: groceryDues,
        houseFundDuesDefault: houseFundDues,
        utilityLineItems: settingsForm.utilityLineItems,
        housePassword: settingsForm.housePassword,
      });
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
    await updateDocument<SharedCost>("sharedCosts", sc.id, {
      active: !sc.active,
    });
  }

  async function toggleHousemateActive(h: Housemate) {
    await updateDocument<Housemate>("housemates", h.id, { active: !h.active });
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
      const activeHousematesList = housemates.filter((h) => h.active);
      const housemateSnapshots: Record<
        string,
        { paid: PaidStatus; feeAdjustment: number }
      > = {};

      activeHousematesList.forEach((h) => {
        housemateSnapshots[h.id] = {
          paid: "unpaid",
          feeAdjustment: 0,
        };
      });

      const utilities: Record<string, number> = {};
      const utilityItems =
        settingsDoc?.utilityLineItems ?? defaultSettings.utilityLineItems;
      utilityItems.forEach((item) => {
        utilities[item] = 0;
      });

      await setDocument<Omit<MonthRecord, "id">>("months", nextMonthKey, {
        monthKey: nextMonthKey,
        utilities,
        groceryDues:
          settingsDoc?.groceryDuesDefault ?? defaultSettings.groceryDuesDefault,
        houseFundDues:
          settingsDoc?.houseFundDuesDefault ??
          defaultSettings.houseFundDuesDefault,
        housemateSnapshots,
        finalized: false,
      } as Omit<MonthRecord, "id">);
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
                      {housemates.map((h) => (
                        <tr key={h.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{h.name}</td>
                          <td className="px-3 py-2">
                            ${h.roomRent.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleHousemateActive(h)}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                h.active
                                  ? "bg-emerald-900/60 text-emerald-200"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {h.active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditingHousemateId(h.id)}
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
                              {m.finalized ? (
                                <span className="text-xs font-semibold text-emerald-300">
                                  ✓ Finalized
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Not finalized
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
                  await updateDocument<MonthRecord>(
                    "months",
                    editingMonthId,
                    updates
                  );
                  setEditingMonthId(null);
                }}
              />
            )}
          </>
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
  const [finalized, setFinalized] = useState(false);
  const [snapshots, setSnapshots] = useState<
    Record<
      string,
      { paid: PaidStatus; feeAdjustment: string; roomRentOverride?: string }
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
    setFinalized(month.finalized ?? false);

    const snaps: Record<
      string,
      { paid: PaidStatus; feeAdjustment: string; roomRentOverride?: string }
    > = {};
    Object.entries(month.housemateSnapshots).forEach(([id, snap]) => {
      snaps[id] = {
        paid: snap.paid,
        feeAdjustment: String(snap.feeAdjustment),
        roomRentOverride: snap.roomRentOverride
          ? String(snap.roomRentOverride)
          : undefined,
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
      { paid: PaidStatus; feeAdjustment: number; roomRentOverride?: number }
    > = {};
    Object.entries(snapshots).forEach(([id, snap]) => {
      const feeAdj = Number(snap.feeAdjustment);
      const roomRent = snap.roomRentOverride
        ? Number(snap.roomRentOverride)
        : undefined;

      updatedSnapshots[id] = {
        paid: snap.paid,
        feeAdjustment: Number.isFinite(feeAdj) ? feeAdj : 0,
        ...(roomRent !== undefined && Number.isFinite(roomRent) && roomRent > 0
          ? { roomRentOverride: roomRent }
          : {}),
      };
    });

    setSaving(true);
    try {
      await onSave({
        utilities: utils,
        groceryDues: groceryDuesNum,
        houseFundDues: houseFundDuesNum,
        housemateSnapshots: updatedSnapshots,
        finalized,
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

        {/* Finalized Toggle */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={finalized}
              onChange={(e) => setFinalized(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-2 focus:ring-sky-400"
            />
            <span className="text-sm font-medium text-slate-200">
              Finalized (prevents adding receipts for this month)
            </span>
          </label>
          {finalized && (
            <p className="mt-1 text-xs text-amber-300">
              ⚠️ Once finalized, receipts cannot be added that would affect this
              month's calculations.
            </p>
          )}
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
                  <th className="px-3 py-2">Fee Adjustment ($)</th>
                  <th className="px-3 py-2">Room Rent Override ($)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(snapshots).map(([housemateId, snap]) => {
                  const housemate = housemates.find(
                    (h) => h.id === housemateId
                  );
                  if (!housemate) return null;
                  return (
                    <tr key={housemateId} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-300">
                        {housemate.name}
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
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={snap.roomRentOverride ?? ""}
                          onChange={(e) =>
                            setSnapshots((s) => ({
                              ...s,
                              [housemateId]: {
                                ...s[housemateId]!,
                                roomRentOverride: e.target.value || undefined,
                              },
                            }))
                          }
                          className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none ring-0 focus:border-sky-400"
                          placeholder="Auto"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                      <th className="px-2 py-1 text-right">Adjust</th>
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

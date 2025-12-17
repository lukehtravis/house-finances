import { FormEvent, useMemo, useState } from "react";
import { PageShell } from "../components/ui/PageShell";
import {
  useCollection,
  addDocument,
  updateDocument,
} from "../hooks/useFirestore";
import type { Housemate } from "../lib/types";

type HousemateFormState = {
  name: string;
  roomRent: string;
  active: boolean;
};

const emptyForm: HousemateFormState = {
  name: "",
  roomRent: "",
  active: true,
};

export function Admin() {
  const {
    data: housemates,
    loading,
    error,
  } = useCollection<Housemate>("housemates", {
    orderByField: "createdAt",
    orderDirection: "asc",
  });

  const [form, setForm] = useState<HousemateFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const editingHousemate = useMemo(
    () => housemates.find((h) => h.id === editingId) ?? null,
    [housemates, editingId]
  );

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const rentNumber = Number(form.roomRent);
    if (!Number.isFinite(rentNumber) || rentNumber <= 0) {
      setFormError("Room rent must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingHousemate) {
        await updateDocument<Housemate>("housemates", editingHousemate.id, {
          name: form.name.trim(),
          roomRent: rentNumber,
          active: form.active,
        });
      } else {
        await addDocument<Omit<Housemate, "id">>("housemates", {
          name: form.name.trim(),
          roomRent: rentNumber,
          active: form.active,
          sharedCostShares: {},
        } as Omit<Housemate, "id">);
      }
      setForm(emptyForm);
      setEditingId(null);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(h: Housemate) {
    setEditingId(h.id);
    setForm({
      name: h.name,
      roomRent: String(h.roomRent),
      active: h.active,
    });
  }

  async function toggleActive(h: Housemate) {
    await updateDocument<Housemate>("housemates", h.id, { active: !h.active });
  }

  return (
    <PageShell title="Admin">
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-50">
            Housemates
          </h2>

          {loading && (
            <p className="text-sm text-slate-400">Loading housemates…</p>
          )}
          {error && (
            <p className="text-sm text-red-400">
              Error loading housemates: {error.message}
            </p>
          )}

          {!loading && !error && housemates.length === 0 && (
            <p className="text-sm text-slate-400">
              No housemates yet. Use the form below or the seed button to add
              some.
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
                      <td className="px-3 py-2">${h.roomRent.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(h)}
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
                          onClick={() => startEdit(h)}
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
          {formError && (
            <p className="mb-2 text-xs font-medium text-red-400">{formError}</p>
          )}
          <form noValidate className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
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
                value={form.roomRent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomRent: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-0 focus:border-sky-400"
              />
            </div>
            <div className="flex items-end sm:col-span-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-400"
                />
                Active
              </label>
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // Explicitly call submit handler so native form validation
                  // cannot block clicks (which can show a "not-allowed" cursor).
                  void handleSubmit();
                }}
                className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                {editingHousemate ? "Save changes" : "Add housemate"}
              </button>
              {editingHousemate && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                  className="text-sm font-medium text-slate-300 hover:text-slate-100"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}

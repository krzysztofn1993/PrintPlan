import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SpoolForm } from "@/components/spools/SpoolForm";
import type { SpoolDto } from "@/lib/spools";

interface SpoolInventoryProps {
  initialSpools: SpoolDto[];
}

interface DeleteError {
  kind: "retryable" | "unauthenticated" | "uncertain" | "generic";
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function orderedSpools(spools: SpoolDto[]): SpoolDto[] {
  return [...spools].sort((left, right) => {
    const byCreated = right.createdAt.localeCompare(left.createdAt);
    return byCreated || left.id.localeCompare(right.id);
  });
}

function describeSpool(spool: SpoolDto): string {
  return `${spool.material}, ${spool.colour}, ${spool.recordedGrams} g`;
}

export function SpoolInventory({ initialSpools }: SpoolInventoryProps) {
  const [spools, setSpools] = useState(() => orderedSpools(initialSpools));
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSpoolId, setEditingSpoolId] = useState<string | null>(null);
  const [deleteSpoolId, setDeleteSpoolId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    document.getElementById(target)?.focus();
    focusTarget.current = null;
  }, [createOpen, editingSpoolId, deleteSpoolId, spools]);

  function openCreate() {
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setEditingSpoolId(null);
    setCreateOpen(true);
  }

  function openEdit(spoolId: string) {
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingSpoolId(spoolId);
  }

  function closeCreate() {
    focusTarget.current = "add-spool-button";
    setCreateOpen(false);
  }

  function closeEdit(spoolId: string) {
    focusTarget.current = `edit-spool-${spoolId}`;
    setEditingSpoolId(null);
  }

  function openDelete(spoolId: string) {
    setDeleteError(null);
    setStatusMessage("");
    focusTarget.current = `confirm-delete-${spoolId}`;
    setDeleteSpoolId(spoolId);
  }

  function closeDelete(spoolId: string) {
    focusTarget.current = `delete-spool-${spoolId}`;
    setDeleteSpoolId(null);
    setDeleteError(null);
  }

  function saveSpool(saved: SpoolDto, mode: "create" | "edit") {
    setSpools((previous) => {
      if (mode === "create") return orderedSpools([saved, ...previous]);
      return orderedSpools(previous.map((spool) => (spool.id === saved.id ? saved : spool)));
    });
    setStatusMessage(`${describeSpool(saved)} saved.`);
    if (mode === "create") {
      focusTarget.current = `edit-spool-${saved.id}`;
      setCreateOpen(false);
    } else {
      focusTarget.current = `edit-spool-${saved.id}`;
      setEditingSpoolId(null);
    }
  }

  async function confirmDelete(spool: SpoolDto) {
    if (deletePending || deleteError?.kind === "uncertain") return;
    setDeleteError(null);
    setDeletePending(true);
    let response: Response;
    try {
      response = await fetch(`/api/spools/${spool.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "",
      });
    } catch {
      setDeleteError({
        kind: "uncertain",
        message: "We couldn't confirm whether deletion completed. Refresh stock before trying again.",
      });
      setDeletePending(false);
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (response.status === 200 && response.ok && isRecord(body) && body.id === spool.id) {
      setSpools((previous) => previous.filter((item) => item.id !== spool.id));
      setDeleteSpoolId(null);
      setDeleteError(null);
      setStatusMessage(`${describeSpool(spool)} deleted.`);
      focusTarget.current = "add-spool-button";
      setDeletePending(false);
      return;
    }

    if (response.ok) {
      setDeleteError({
        kind: "uncertain",
        message: "Deletion may have completed, but its result could not be read. Refresh stock before trying again.",
      });
    } else if (response.status === 401) {
      setDeleteError({ kind: "unauthenticated", message: "Your session has expired. Sign in to continue." });
    } else if (response.status === 404) {
      setDeleteError({
        kind: "generic",
        message: "This spool is no longer available. Refresh stock to see the latest inventory.",
      });
    } else if (response.status === 503) {
      setDeleteError({ kind: "retryable", message: "Stock is temporarily unavailable. You can try again." });
    } else if (response.status === 403) {
      setDeleteError({ kind: "generic", message: "This request was rejected. Refresh stock and try again." });
    } else {
      setDeleteError({ kind: "generic", message: "We couldn't delete this spool. Please try again." });
    }
    setDeletePending(false);
  }

  return (
    <section aria-labelledby="inventory-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="inventory-heading" className="text-xl font-semibold text-white">
            Your spools
          </h2>
          <p className="mt-1 text-sm text-blue-100/70">
            Each spool is tracked separately, even when its labels match another.
          </p>
        </div>
        <Button id="add-spool-button" type="button" onClick={openCreate} disabled={createOpen}>
          Add a spool
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-200">
        {statusMessage}
      </p>

      {createOpen && (
        <section
          aria-labelledby="create-spool-heading"
          className="rounded-xl border border-white/15 bg-white/5 p-4 sm:p-6"
        >
          <h3 id="create-spool-heading" className="mb-4 text-lg font-semibold text-white">
            Add a spool
          </h3>
          <SpoolForm
            mode="create"
            onSaved={(saved) => {
              saveSpool(saved, "create");
            }}
            onCancel={closeCreate}
          />
        </section>
      )}

      {spools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center sm:p-8">
          <h3 className="text-lg font-medium text-white">No spools yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-blue-100/70">
            Add your first spool to keep an estimate of your filament stock.
          </p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
          {spools.map((spool) => {
            const isEditing = editingSpoolId === spool.id;
            const isDeleting = deleteSpoolId === spool.id;
            const shortId = spool.id.slice(0, 8);

            return (
              <li key={spool.id} className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
                <article aria-labelledby={`spool-title-${spool.id}`} className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3
                        id={`spool-title-${spool.id}`}
                        className="text-lg font-semibold [overflow-wrap:anywhere] break-words text-white"
                      >
                        {spool.material}{" "}
                        <span aria-hidden="true" className="text-white/50">
                          ·
                        </span>{" "}
                        {spool.colour}
                      </h3>
                      <p className="mt-1 text-xs text-blue-100/60">
                        Spool <code>{shortId}</code>
                      </p>
                    </div>
                    {!isEditing && !isDeleting && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          id={`edit-spool-${spool.id}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openEdit(spool.id);
                          }}
                          aria-label={`Edit spool ${shortId}`}
                        >
                          Edit
                        </Button>
                        <Button
                          id={`delete-spool-${spool.id}`}
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            openDelete(spool.id);
                          }}
                          aria-label={`Delete spool ${shortId}`}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  <dl className="mt-5 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="min-w-0 rounded-lg bg-white/5 p-3">
                      <dt className="text-xs text-blue-100/60">Recorded</dt>
                      <dd className="mt-1 text-lg font-semibold break-words text-white">{spool.recordedGrams} g</dd>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white/5 p-3">
                      <dt className="text-xs text-blue-100/60">Reserved</dt>
                      <dd className="mt-1 text-lg font-semibold break-words text-white">{spool.reservedGrams} g</dd>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white/5 p-3">
                      <dt className="text-xs text-blue-100/60">Available</dt>
                      <dd className="mt-1 text-lg font-semibold break-words text-white">{spool.availableGrams} g</dd>
                    </div>
                  </dl>

                  {isEditing && (
                    <div className="mt-5 rounded-lg border border-white/10 bg-black/10 p-4">
                      <h4 className="mb-4 text-base font-medium text-white">Correct this spool</h4>
                      <SpoolForm
                        key={spool.id}
                        mode="edit"
                        spool={spool}
                        onSaved={(saved) => {
                          saveSpool(saved, "edit");
                        }}
                        onCancel={() => {
                          closeEdit(spool.id);
                        }}
                      />
                    </div>
                  )}

                  {isDeleting && (
                    <div
                      className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/5 p-4"
                      aria-labelledby={`delete-confirmation-${spool.id}`}
                    >
                      <h4 id={`delete-confirmation-${spool.id}`} className="font-semibold text-white">
                        Delete this spool?
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed [overflow-wrap:anywhere] break-words text-blue-100/80">
                        Confirm deletion of {describeSpool(spool)}. Full spool ID:{" "}
                        <code className="break-all">{spool.id}</code>
                      </p>
                      {deleteError && (
                        <div
                          role="alert"
                          className="border-destructive/40 bg-destructive/10 text-destructive mt-3 rounded-md border p-3 text-sm"
                        >
                          <p>{deleteError.message}</p>
                          {deleteError.kind === "unauthenticated" && (
                            <a
                              className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                              href="/auth/signin"
                            >
                              Sign in
                            </a>
                          )}
                          {deleteError.kind === "uncertain" && (
                            <a
                              className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                              href="/dashboard/spools"
                            >
                              Refresh stock
                            </a>
                          )}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          id={`confirm-delete-${spool.id}`}
                          type="button"
                          variant="destructive"
                          onClick={() => void confirmDelete(spool)}
                          disabled={deletePending || deleteError?.kind === "uncertain"}
                        >
                          {deletePending ? "Deleting…" : "Confirm deletion"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            closeDelete(spool.id);
                          }}
                          disabled={deletePending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

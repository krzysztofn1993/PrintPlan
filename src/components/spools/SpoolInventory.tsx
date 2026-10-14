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
  const [mutationPending, setMutationPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const focusTarget = useRef<string | null>(null);
  const mutationPendingRef = useRef(false);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    document.getElementById(target)?.focus();
    focusTarget.current = null;
  }, [createOpen, editingSpoolId, deleteSpoolId, spools]);

  function updateMutationPending(pending: boolean) {
    mutationPendingRef.current = pending;
    setMutationPending(pending);
  }

  function updateDeletePending(pending: boolean) {
    setDeletePending(pending);
    updateMutationPending(pending);
  }

  function openCreate() {
    if (mutationPendingRef.current) return;
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setEditingSpoolId(null);
    setCreateOpen(true);
  }

  function openEdit(spoolId: string) {
    if (mutationPendingRef.current) return;
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingSpoolId(spoolId);
  }

  function closeCreate() {
    if (mutationPendingRef.current) return;
    focusTarget.current = "add-spool-button";
    setCreateOpen(false);
  }

  function closeEdit(spoolId: string) {
    if (mutationPendingRef.current) return;
    focusTarget.current = `edit-spool-${spoolId}`;
    setEditingSpoolId(null);
  }

  function openDelete(spoolId: string) {
    if (mutationPendingRef.current) return;
    setDeleteError(null);
    setStatusMessage("");
    focusTarget.current = `confirm-delete-${spoolId}`;
    setDeleteSpoolId(spoolId);
  }

  function closeDelete(spoolId: string) {
    if (mutationPendingRef.current) return;
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
    if (mutationPendingRef.current || deleteError?.kind === "uncertain") return;
    setDeleteError(null);
    updateDeletePending(true);
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
      updateDeletePending(false);
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
      updateDeletePending(false);
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
    updateDeletePending(false);
  }

  return (
    <section aria-labelledby="inventory-heading" className="carbon-collection">
      <div className="carbon-collection-header">
        <div className="carbon-collection-heading">
          <h2 id="inventory-heading" className="text-foreground text-xl font-semibold">
            Your spools
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Each spool is tracked separately, even when its labels match another.
          </p>
        </div>
        <div className="carbon-collection-actions">
          <Button id="add-spool-button" type="button" onClick={openCreate} disabled={createOpen || mutationPending}>
            Add a spool
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="carbon-status-message">
        {statusMessage}
      </p>

      {createOpen && (
        <section aria-labelledby="create-spool-heading" className="carbon-inline-panel">
          <h3 id="create-spool-heading" className="mb-4 text-lg font-semibold">
            Add a spool
          </h3>
          <SpoolForm
            mode="create"
            mutationPending={mutationPending}
            onPendingChange={updateMutationPending}
            onSaved={(saved) => {
              saveSpool(saved, "create");
            }}
            onCancel={closeCreate}
          />
        </section>
      )}

      {spools.length === 0 ? (
        <div className="carbon-empty-state">
          <h3 className="text-card-foreground text-lg font-medium">No spools yet</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Add your first spool to keep an estimate of your filament stock.
          </p>
        </div>
      ) : (
        <ul className="carbon-row-list">
          {spools.map((spool) => {
            const isEditing = editingSpoolId === spool.id;
            const isDeleting = deleteSpoolId === spool.id;
            const shortId = spool.id.slice(0, 8);

            return (
              <li key={spool.id}>
                <article aria-labelledby={`spool-title-${spool.id}`} className="carbon-collection-row">
                  <div className="carbon-row-main">
                    <h3
                      id={`spool-title-${spool.id}`}
                      className="carbon-row-title text-card-foreground text-lg font-semibold"
                    >
                      {spool.material}{" "}
                      <span aria-hidden="true" className="text-muted-foreground">
                        ·
                      </span>{" "}
                      {spool.colour}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Spool <code className="font-mono">{shortId}</code>
                    </p>
                  </div>

                  <dl className="carbon-row-values">
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Recorded</dt>
                      <dd className="carbon-value text-foreground text-lg">{spool.recordedGrams} g</dd>
                    </div>
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Reserved</dt>
                      <dd className="carbon-value text-foreground text-lg">{spool.reservedGrams} g</dd>
                    </div>
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Available</dt>
                      <dd className="carbon-value text-foreground text-lg">{spool.availableGrams} g</dd>
                    </div>
                  </dl>

                  {!isEditing && !isDeleting && (
                    <div className="carbon-row-actions">
                      <Button
                        id={`edit-spool-${spool.id}`}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={mutationPending}
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
                        disabled={mutationPending}
                        onClick={() => {
                          openDelete(spool.id);
                        }}
                        aria-label={`Delete spool ${shortId}`}
                      >
                        Delete
                      </Button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="carbon-inline-panel carbon-row-inline-panel">
                      <h4 className="mb-4 text-base font-medium">Correct this spool</h4>
                      <SpoolForm
                        key={spool.id}
                        mode="edit"
                        spool={spool}
                        mutationPending={mutationPending}
                        onPendingChange={updateMutationPending}
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
                      className="carbon-inline-panel carbon-inline-panel-warning carbon-row-inline-panel"
                      aria-labelledby={`delete-confirmation-${spool.id}`}
                    >
                      <h4 id={`delete-confirmation-${spool.id}`} className="font-semibold">
                        Delete this spool?
                      </h4>
                      <p className="carbon-row-secondary mt-2 text-sm leading-relaxed">
                        Confirm deletion of {describeSpool(spool)}. Full spool ID:{" "}
                        <code className="break-all">{spool.id}</code>
                      </p>
                      {deleteError && (
                        <div role="alert" className="carbon-feedback carbon-feedback-error mt-3">
                          <p>{deleteError.message}</p>
                          {deleteError.kind === "unauthenticated" && (
                            <a className="carbon-feedback-link" href="/auth/signin">
                              Sign in
                            </a>
                          )}
                          {deleteError.kind === "uncertain" && (
                            <a className="carbon-feedback-link" href="/dashboard/spools">
                              Refresh stock
                            </a>
                          )}
                        </div>
                      )}
                      <div className="carbon-form-actions mt-4">
                        <Button
                          id={`confirm-delete-${spool.id}`}
                          type="button"
                          variant="destructive"
                          onClick={() => void confirmDelete(spool)}
                          disabled={mutationPending || deleteError?.kind === "uncertain"}
                        >
                          {deletePending ? "Deleting…" : "Confirm deletion"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            closeDelete(spool.id);
                          }}
                          disabled={mutationPending}
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

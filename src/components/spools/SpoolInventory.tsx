import { useEffect, useRef, useState } from "react";
import {
  CollectionTable,
  CollectionTableCell,
  CollectionTableDetailRow,
  CollectionTableRecord,
  CollectionTableRow,
} from "@/components/ui/CollectionTable";
import { Button } from "@/components/ui/button";
import { SpoolForm } from "@/components/spools/SpoolForm";
import { readSpoolDto } from "@/lib/spool-dto";
import type { SpoolDto } from "@/lib/spools";

interface SpoolInventoryProps {
  initialSpools: SpoolDto[];
}

interface DeleteError {
  kind: "retryable" | "unauthenticated" | "uncertain" | "generic";
  message: string;
}

const uncertainDeletionMessage =
  "Deletion may have completed, but its cancellation details could not be read. Refresh stock to review current spools; refreshing cannot recover the original cancellation list.";

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
  const [refreshing, setRefreshing] = useState(false);
  const [uncertaintyGuard, setUncertaintyGuard] = useState(false);
  const [listError, setListError] = useState("");
  const focusTarget = useRef<string | null>(null);
  const mutationPendingRef = useRef(false);
  const refreshingRef = useRef(false);

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

  function handleUncertainMutation() {
    setUncertaintyGuard(true);
    setStatusMessage("");
  }

  async function refreshStock(intent: "review" | "correction" = "review"): Promise<boolean> {
    if ((mutationPendingRef.current && intent === "review") || refreshingRef.current) return false;
    refreshingRef.current = true;
    setRefreshing(true);
    if (intent === "correction") setListError("");
    let response: Response;
    try {
      response = await fetch("/api/spools", { method: "GET", cache: "no-store" });
    } catch {
      if (intent === "review") {
        setListError("Stock could not be reached. The pending action remains blocked; try refreshing again.");
      }
      refreshingRef.current = false;
      setRefreshing(false);
      return false;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const values = response.ok && isRecord(body) && Array.isArray(body.spools) ? body.spools : undefined;
    const latest = values?.map(readSpoolDto);
    const validSpools = latest?.filter((spool): spool is SpoolDto => spool !== undefined);
    if (!latest || latest.length !== validSpools?.length) {
      if (intent === "review") {
        setListError(
          "The latest stock state could not be read. The pending action remains blocked; try refreshing again.",
        );
      }
      refreshingRef.current = false;
      setRefreshing(false);
      return false;
    }
    setSpools(orderedSpools(validSpools));
    setListError("");
    if (intent === "correction") {
      const targetIsAvailable = validSpools.some((spool) => spool.id === editingSpoolId);
      if (editingSpoolId && !targetIsAvailable) {
        setEditingSpoolId(null);
        setStatusMessage("This spool is no longer available. The unsaved correction was not saved.");
      } else {
        setStatusMessage("Reservation amounts refreshed. Review the latest saved quantities before saving.");
      }
    } else {
      setUncertaintyGuard(false);
      setDeleteError(null);
      setDeleteSpoolId(null);
      setCreateOpen(false);
      setEditingSpoolId(null);
      setStatusMessage("Stock refreshed. Review the current saved spools before making another change.");
    }
    refreshingRef.current = false;
    setRefreshing(false);
    return true;
  }

  function openCreate() {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setEditingSpoolId(null);
    setCreateOpen(true);
  }

  function openEdit(spoolId: string) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setStatusMessage("");
    setDeleteSpoolId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingSpoolId(spoolId);
  }

  function closeCreate() {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    focusTarget.current = "add-spool-button";
    setCreateOpen(false);
  }

  function closeEdit(spoolId: string) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    focusTarget.current = `edit-spool-${spoolId}`;
    setEditingSpoolId(null);
  }

  function openDelete(spoolId: string) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
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
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
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
      handleUncertainMutation();
      setDeleteError({
        kind: "uncertain",
        message: uncertainDeletionMessage,
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

    if (
      response.status === 200 &&
      response.ok &&
      isRecord(body) &&
      body.id === spool.id &&
      Array.isArray(body.cancelledReservations)
    ) {
      const cancelled = body.cancelledReservations.flatMap((value) => {
        if (
          !isRecord(value) ||
          typeof value.printId !== "string" ||
          typeof value.material !== "string" ||
          typeof value.colour !== "string" ||
          typeof value.releasedGrams !== "number" ||
          !Number.isSafeInteger(value.releasedGrams)
        )
          return [];
        const description =
          typeof value.printName === "string" && value.printName
            ? value.printName
            : `${value.material}, ${value.colour}`;
        return [`${description} (print ${value.printId}) released ${value.releasedGrams} g`];
      });
      setSpools((previous) => previous.filter((item) => item.id !== spool.id));
      setDeleteSpoolId(null);
      setDeleteError(null);
      setStatusMessage(
        cancelled.length
          ? `${describeSpool(spool)} deleted. Cancelled reservations: ${cancelled.join("; ")}.`
          : `${describeSpool(spool)} deleted. No active reservations were cancelled.`,
      );
      focusTarget.current = "add-spool-button";
      updateDeletePending(false);
      return;
    }

    if (response.status >= 500 || response.ok) {
      handleUncertainMutation();
      setDeleteError({
        kind: "uncertain",
        message: uncertainDeletionMessage,
      });
    } else if (response.status === 401) {
      setDeleteError({ kind: "unauthenticated", message: "Your session has expired. Sign in to continue." });
    } else if (response.status === 404) {
      setDeleteError({
        kind: "generic",
        message: "This spool is no longer available. Refresh stock to see the latest inventory.",
      });
    } else if (response.status === 503) {
      handleUncertainMutation();
      setDeleteError({
        kind: "uncertain",
        message: uncertainDeletionMessage,
      });
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
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshStock()}
            disabled={mutationPending || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh stock"}
          </Button>
          <Button
            id="add-spool-button"
            type="button"
            onClick={openCreate}
            disabled={createOpen || mutationPending || refreshing || uncertaintyGuard}
          >
            Add a spool
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="carbon-status-message">
        {statusMessage}
      </p>
      {uncertaintyGuard && (
        <div role="alert" className="carbon-feedback carbon-feedback-warning">
          <p>
            A stock change may have completed without confirmation. Refresh stock and review it before repeating any
            action.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshStock()}
            disabled={refreshing || mutationPending}
          >
            {refreshing ? "Refreshing…" : "Refresh and review stock"}
          </Button>
        </div>
      )}
      {listError && (
        <div role="alert" className="carbon-feedback carbon-feedback-error">
          {listError}
        </div>
      )}

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
            onUncertain={handleUncertainMutation}
            onRefreshLatest={refreshStock}
            onRefreshCorrection={() => refreshStock("correction")}
            mutationGuarded={uncertaintyGuard}
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
        <CollectionTable
          label="Filament stock"
          actionColumn="compact"
          columns={[
            { label: "Filament" },
            { label: "Recorded" },
            { label: "Reserved" },
            { label: "Available" },
            { label: "Actions" },
          ]}
        >
          {spools.map((spool) => {
            const isEditing = editingSpoolId === spool.id;
            const isDeleting = deleteSpoolId === spool.id;
            const shortId = spool.id.slice(0, 8);

            return (
              <CollectionTableRecord key={spool.id} labelledBy={`spool-title-${spool.id}`}>
                <CollectionTableRow labelledBy={`spool-title-${spool.id}`}>
                  <CollectionTableCell label="Filament" mobileFullWidth className="carbon-row-main">
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
                  </CollectionTableCell>

                  <CollectionTableCell label="Recorded">
                    <p className="carbon-value text-foreground text-lg">{spool.recordedGrams} g</p>
                  </CollectionTableCell>

                  <CollectionTableCell label="Reserved">
                    <p className="carbon-value text-foreground text-lg">{spool.reservedGrams} g</p>
                  </CollectionTableCell>

                  <CollectionTableCell label="Available">
                    <p className="carbon-value text-foreground text-lg">{spool.availableGrams} g</p>
                  </CollectionTableCell>

                  <CollectionTableCell
                    label={!isEditing && !isDeleting ? "Actions" : undefined}
                    mobileFullWidth={!isEditing && !isDeleting}
                    className={isEditing || isDeleting ? "sr-only" : undefined}
                  >
                    {!isEditing && !isDeleting && (
                      <div className="carbon-row-actions carbon-data-table-actions">
                        <Button
                          id={`edit-spool-${spool.id}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutationPending || refreshing || uncertaintyGuard}
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
                          disabled={mutationPending || refreshing || uncertaintyGuard}
                          onClick={() => {
                            openDelete(spool.id);
                          }}
                          aria-label={`Delete spool ${shortId}`}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </CollectionTableCell>
                </CollectionTableRow>

                {isEditing && (
                  <CollectionTableDetailRow labelledBy={`edit-spool-heading-${spool.id}`}>
                    <section
                      id={`edit-spool-panel-${spool.id}`}
                      aria-labelledby={`edit-spool-heading-${spool.id}`}
                      className="carbon-inline-panel"
                    >
                      <h4 id={`edit-spool-heading-${spool.id}`} className="mb-4 text-base font-medium">
                        Correct this spool
                      </h4>
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
                        onUncertain={handleUncertainMutation}
                        onRefreshLatest={refreshStock}
                        onRefreshCorrection={() => refreshStock("correction")}
                        mutationGuarded={uncertaintyGuard}
                      />
                    </section>
                  </CollectionTableDetailRow>
                )}

                {isDeleting && (
                  <CollectionTableDetailRow labelledBy={`delete-confirmation-${spool.id}`}>
                    <section
                      id={`delete-spool-panel-${spool.id}`}
                      aria-labelledby={`delete-confirmation-${spool.id}`}
                      className="carbon-inline-panel carbon-inline-panel-warning"
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
                            <div className="carbon-feedback-actions">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void refreshStock()}
                                disabled={mutationPending || refreshing}
                              >
                                {refreshing ? "Refreshing…" : "Refresh stock"}
                              </Button>
                              <a className="carbon-feedback-link" href="/dashboard/prints">
                                Manage reservations in planned prints
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="carbon-form-actions mt-4">
                        <Button
                          id={`confirm-delete-${spool.id}`}
                          type="button"
                          variant="destructive"
                          onClick={() => void confirmDelete(spool)}
                          disabled={
                            mutationPending || refreshing || uncertaintyGuard || deleteError?.kind === "uncertain"
                          }
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
                    </section>
                  </CollectionTableDetailRow>
                )}
              </CollectionTableRecord>
            );
          })}
        </CollectionTable>
      )}
    </section>
  );
}

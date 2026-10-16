import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrintForm } from "@/components/prints/PrintForm";
import { ReservationPanel } from "@/components/prints/ReservationPanel";
import { readPrintDto } from "@/lib/print-dto";
import type { PrintDto } from "@/lib/prints";
import type { ReservationPreview } from "@/lib/reservations";
import { readSpoolDto } from "@/lib/spool-dto";
import type { SpoolDto } from "@/lib/spools";

interface PrintListProps {
  initialPrints: PrintDto[];
}

interface ListError {
  kind: "unauthenticated" | "unavailable" | "generic";
  message: string;
}

interface DeleteError {
  kind: "unauthenticated" | "not_found" | "generic";
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPrints(prints: PrintDto[]): PrintDto[] {
  return [...prints].sort((left, right) => {
    const byCreated = right.createdAt.localeCompare(left.createdAt);
    return byCreated || left.id.localeCompare(right.id);
  });
}

function describePrint(print: PrintDto): string {
  return print.name ?? `${print.material}, ${print.colour}, ${print.requiredGrams} g`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function PrintList({ initialPrints }: PrintListProps) {
  const [prints, setPrints] = useState(() => orderedPrints(initialPrints));
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPrintId, setEditingPrintId] = useState<string | null>(null);
  const [deletePrintId, setDeletePrintId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [listError, setListError] = useState<ListError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uncertaintyGuard, setUncertaintyGuard] = useState(false);
  const [reservationPrintId, setReservationPrintId] = useState<string | null>(null);
  const [reservationPreview, setReservationPreview] = useState<ReservationPreview | null>(null);
  const [selectedSpoolId, setSelectedSpoolId] = useState("");
  const [reservationSelectionMode, setReservationSelectionMode] = useState<"best_fit" | "manual">("best_fit");
  const [reservationPending, setReservationPending] = useState(false);
  const [reservationPreviewLoading, setReservationPreviewLoading] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const focusTarget = useRef<string | null>(null);
  const mutationPendingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    document.getElementById(target)?.focus();
    focusTarget.current = null;
  }, [createOpen, editingPrintId, deletePrintId, prints]);

  function updateMutationPending(pending: boolean) {
    mutationPendingRef.current = pending;
    setMutationPending(pending);
  }

  function updateDeletePending(pending: boolean) {
    setDeletePending(pending);
    updateMutationPending(pending);
  }

  function openCreate() {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setEditingPrintId(null);
    setCreateOpen(true);
  }

  function openEdit(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingPrintId(printId);
  }

  function closeCreate() {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    focusTarget.current = "add-print-button";
    setCreateOpen(false);
  }

  function closeEdit(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    focusTarget.current = `edit-print-${printId}`;
    setEditingPrintId(null);
  }

  function openDelete(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    setDeleteError(null);
    setStatusMessage("");
    focusTarget.current = `confirm-delete-${printId}`;
    setDeletePrintId(printId);
  }

  function closeDelete(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    focusTarget.current = `delete-print-${printId}`;
    setDeletePrintId(null);
    setDeleteError(null);
  }

  function savePrint(saved: PrintDto, mode: "create" | "edit") {
    setPrints((previous) => {
      if (mode === "create") return orderedPrints([saved, ...previous]);
      return orderedPrints(previous.map((print) => (print.id === saved.id ? saved : print)));
    });
    setStatusMessage(`${describePrint(saved)} saved.`);
    if (mode === "create") {
      focusTarget.current = `edit-print-${saved.id}`;
      setCreateOpen(false);
    } else {
      focusTarget.current = `edit-print-${saved.id}`;
      setEditingPrintId(null);
    }
  }

  function handleUncertainMutation() {
    setUncertaintyGuard(true);
    setStatusMessage("");
  }

  function describeListFailure(response: Response): ListError {
    if (response.status === 401) {
      return { kind: "unauthenticated", message: "Your session has expired. Sign in to continue." };
    }
    if (response.status === 503) {
      return { kind: "unavailable", message: "Prints are temporarily unavailable. Please try again." };
    }
    return { kind: "generic", message: "We couldn't refresh your print list. Please try again." };
  }

  async function fetchLatestPrints(): Promise<PrintDto[] | undefined> {
    let response: Response;
    try {
      response = await fetch("/api/prints", { method: "GET", cache: "no-store" });
    } catch {
      setListError({ kind: "unavailable", message: "The print list could not be reached. Please try again." });
      return undefined;
    }

    if (!response.ok) {
      setListError(describeListFailure(response));
      return undefined;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const values = isRecord(body) && Array.isArray(body.prints) ? body.prints : undefined;
    if (!values) {
      setListError({ kind: "generic", message: "The refreshed print list could not be read. Please try again." });
      return undefined;
    }
    const refreshed = values.map(readPrintDto);
    if (refreshed.some((print) => print === undefined)) {
      setListError({ kind: "generic", message: "The refreshed print list could not be read. Please try again." });
      return undefined;
    }
    setListError(null);
    return orderedPrints(refreshed as PrintDto[]);
  }

  async function refreshList(options: { conflictId?: string } = {}): Promise<boolean> {
    if (mutationPendingRef.current || refreshingRef.current) return false;
    if (!options.conflictId && (createOpen || editingPrintId || deletePrintId)) {
      const accepted = window.confirm("Refreshing the list will discard unsaved form entries. Continue?");
      if (!accepted) return false;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    const refreshed = await fetchLatestPrints();
    refreshingRef.current = false;
    setRefreshing(false);
    if (!refreshed) return false;

    setPrints(refreshed);
    setUncertaintyGuard(false);
    setReservationPrintId(null);
    setReservationPreview(null);
    setDeleteError(null);
    setDeletePrintId(null);
    setCreateOpen(false);
    setEditingPrintId(
      options.conflictId && refreshed.some((print) => print.id === options.conflictId) ? options.conflictId : null,
    );
    setStatusMessage("Print list refreshed. Review the current saved prints before making another change.");
    if (options.conflictId && !refreshed.some((print) => print.id === options.conflictId)) {
      setStatusMessage("Print list refreshed. This print is no longer available.");
    }
    focusTarget.current =
      options.conflictId && refreshed.some((print) => print.id === options.conflictId)
        ? `edit-print-${options.conflictId}`
        : "add-print-button";
    return true;
  }

  async function loadReservationPreview(printId: string) {
    setReservationPreviewLoading(true);
    setReservationError("");
    let response: Response;
    try {
      response = await fetch(`/api/prints/${printId}/reservation`, { method: "GET", cache: "no-store" });
    } catch {
      setReservationError("The preview could not be reached. Try loading it again.");
      setReservationPreviewLoading(false);
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.ok && isRecord(body) && Array.isArray(body.eligibleSpools)) {
      const eligibleSpools = body.eligibleSpools.map(readSpoolDto);
      if (
        typeof body.printId === "string" &&
        body.printId === printId &&
        typeof body.expectedVersion === "number" &&
        Number.isSafeInteger(body.expectedVersion) &&
        body.expectedVersion > 0 &&
        typeof body.marginPercent === "number" &&
        body.marginPercent >= 0 &&
        body.marginPercent <= 100 &&
        typeof body.reservationGrams === "number" &&
        Number.isSafeInteger(body.reservationGrams) &&
        body.reservationGrams > 0 &&
        (typeof body.suggestedSpoolId === "string" || body.suggestedSpoolId === null) &&
        eligibleSpools.every((spool): spool is SpoolDto => spool !== undefined)
      ) {
        const preview: ReservationPreview = {
          printId,
          expectedVersion: body.expectedVersion,
          marginPercent: body.marginPercent,
          reservationGrams: body.reservationGrams,
          suggestedSpoolId: body.suggestedSpoolId,
          eligibleSpools,
        };
        setReservationPreview(preview);
        setReservationSelectionMode("best_fit");
        setSelectedSpoolId(
          preview.suggestedSpoolId ?? (preview.eligibleSpools.length ? preview.eligibleSpools[0].id : ""),
        );
        setReservationPreviewLoading(false);
        return;
      }
    }
    if (response.status === 409 && isRecord(body) && isRecord(body.error) && body.error.code === "already_reserved") {
      await refreshList({ conflictId: printId });
      setReservationError("This print already has a reservation. The current saved state has been refreshed.");
    } else {
      setReservationError(
        response.status >= 500
          ? "The preview is temporarily unavailable. Try again."
          : "The preview could not be read. Refresh the print list and try again.",
      );
    }
    setReservationPreview(null);
    setReservationPreviewLoading(false);
  }

  function openReservation(print: PrintDto) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setReservationPrintId(print.id);
    setReservationPreview(null);
    setReservationError("");
    if (!print.reservation) void loadReservationPreview(print.id);
  }

  async function confirmReservation(print: PrintDto) {
    const preview = reservationPreview;
    if (!preview || !selectedSpoolId || mutationPendingRef.current || uncertaintyGuard) return;
    setReservationPending(true);
    updateMutationPending(true);
    setReservationError("");
    let response: Response;
    try {
      response = await fetch(`/api/prints/${print.id}/reservation/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          requestId: crypto.randomUUID(),
          expectedVersion: String(preview.expectedVersion),
          spoolId: selectedSpoolId,
          selectionMode: reservationSelectionMode,
        }),
      });
    } catch {
      handleUncertainMutation();
      setReservationError(
        "We couldn't confirm whether the reservation completed. Refresh the print list and review current stock before trying again.",
      );
      setReservationPending(false);
      updateMutationPending(false);
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.status === 200 && response.ok && isRecord(body) && typeof body.reservationId === "string") {
      const saved = readPrintDto(body.print);
      if (saved?.id === print.id && saved.reservation?.id === body.reservationId) {
        setPrints((previous) => orderedPrints(previous.map((item) => (item.id === print.id ? saved : item))));
        setStatusMessage(
          `${describePrint(saved)} now has ${saved.reservation.reservedGrams} g reserved. Recorded stock was not consumed.`,
        );
        setReservationPrintId(null);
        setReservationPreview(null);
        focusTarget.current = `manage-reservation-${print.id}`;
      } else {
        handleUncertainMutation();
        setReservationError(
          "The reservation may have completed, but its current state could not be read. Refresh the print list before trying again.",
        );
      }
    } else if (response.status === 409 && isRecord(body) && isRecord(body.error)) {
      const code = body.error.code;
      if (code === "selection_stale") {
        await loadReservationPreview(print.id);
        setReservationError("The suggested best fit changed. Review this fresh preview and confirm again.");
      } else if (code === "insufficient_material") {
        await loadReservationPreview(print.id);
        setReservationError("No eligible spool has enough available material. The preview has been refreshed.");
      } else if (code === "already_reserved" || code === "edit_conflict") {
        handleUncertainMutation();
        setReservationError(
          "The print changed before confirmation. Refresh the print list and review its current state.",
        );
      } else {
        setReservationError(
          typeof body.error.message === "string" ? body.error.message : "The reservation could not be confirmed.",
        );
      }
    } else if (response.status >= 500 || response.ok) {
      handleUncertainMutation();
      setReservationError(
        "The reservation outcome may be uncertain. Refresh the print list and review current stock before trying again.",
      );
    } else if (response.status === 404) {
      setReservationError("This print is no longer available. Refresh the print list.");
    } else {
      setReservationError("The reservation could not be confirmed. Review the preview and try again.");
    }
    setReservationPending(false);
    updateMutationPending(false);
  }

  async function releaseReservation(print: PrintDto) {
    const reservationId = print.reservation?.id;
    if (!reservationId || mutationPendingRef.current || uncertaintyGuard) return;
    setReservationPending(true);
    updateMutationPending(true);
    setReservationError("");
    let response: Response;
    try {
      response = await fetch(`/api/prints/${print.id}/reservation/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ reservationId }),
      });
    } catch {
      handleUncertainMutation();
      setReservationError(
        "We couldn't confirm whether material was released. Refresh the print list before trying again.",
      );
      setReservationPending(false);
      updateMutationPending(false);
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const current = response.status === 200 && response.ok && isRecord(body) ? readPrintDto(body.print) : undefined;
    if (current?.id === print.id && isRecord(body) && body.reservationId === reservationId) {
      setPrints((previous) => orderedPrints(previous.map((item) => (item.id === print.id ? current : item))));
      if (current.reservation) {
        setReservationError(
          "The displayed reservation was released, and a newer reservation is now active. The current state has been updated.",
        );
        setReservationPrintId(print.id);
      } else {
        setStatusMessage(`${print.reservation?.reservedGrams} g released. Recorded stock remains unchanged.`);
        setReservationPrintId(null);
      }
      setReservationPreview(null);
      focusTarget.current = current.reservation ? `manage-reservation-${print.id}` : `reserve-material-${print.id}`;
    } else if (response.status >= 500 || response.ok) {
      handleUncertainMutation();
      setReservationError(
        "The release outcome may be uncertain. Refresh the print list and review current stock before trying again.",
      );
    } else {
      setReservationError(
        "The reservation could not be released. Refresh the print list and review the current state.",
      );
    }
    setReservationPending(false);
    updateMutationPending(false);
  }

  async function confirmDelete(print: PrintDto) {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard) return;
    setDeleteError(null);
    updateDeletePending(true);
    let response: Response;
    try {
      response = await fetch(`/api/prints/${print.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "",
      });
    } catch {
      handleUncertainMutation();
      setDeleteError({
        kind: "generic",
        message: "We couldn't confirm whether deletion completed. Refresh the print list before trying again.",
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

    if (response.status === 200 && response.ok && isRecord(body) && body.id === print.id) {
      setPrints((previous) => previous.filter((item) => item.id !== print.id));
      setDeletePrintId(null);
      setDeleteError(null);
      const releasedGrams =
        typeof body.releasedGrams === "number" && Number.isSafeInteger(body.releasedGrams) ? body.releasedGrams : 0;
      const spool = isRecord(body.spool) ? body.spool : undefined;
      const spoolDescription =
        spool && typeof spool.material === "string" && typeof spool.colour === "string"
          ? ` from ${spool.material}, ${spool.colour}`
          : "";
      setStatusMessage(
        releasedGrams > 0
          ? `${describePrint(print)} deleted; ${releasedGrams} g released${spoolDescription}. Recorded stock was not consumed.`
          : `${describePrint(print)} deleted.`,
      );
      focusTarget.current = "add-print-button";
      updateDeletePending(false);
      return;
    }

    if (response.status >= 500 && response.status <= 599) {
      handleUncertainMutation();
      setDeleteError({
        kind: "generic",
        message: "The deletion outcome may be uncertain. Refresh the print list and review it before trying again.",
      });
    } else if (response.ok) {
      handleUncertainMutation();
      setDeleteError({
        kind: "generic",
        message:
          "Deletion may have completed, but its result could not be read. Refresh the print list before trying again.",
      });
    } else if (response.status === 401) {
      setDeleteError({ kind: "unauthenticated", message: "Your session has expired. Sign in to continue." });
    } else if (response.status === 404) {
      setDeleteError({
        kind: "not_found",
        message: "This print is no longer available. Refresh the list to see the latest prints.",
      });
    } else if (response.status === 403) {
      setDeleteError({ kind: "generic", message: "This request was rejected. Refresh the list and try again." });
    } else {
      setDeleteError({ kind: "generic", message: "We couldn't delete this print. Please try again." });
    }
    updateDeletePending(false);
  }

  return (
    <section aria-labelledby="prints-list-heading" className="carbon-collection">
      <div className="carbon-collection-header">
        <div className="carbon-collection-heading">
          <p className="carbon-label">Your queue</p>
          <h2 id="prints-list-heading" className="mt-1 text-xl font-semibold">
            Planned prints
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Each print stays independent, even when its name or requirements match another.
          </p>
        </div>
        <div className="carbon-collection-actions">
          <Button
            id="refresh-prints-button"
            type="button"
            variant="outline"
            onClick={() => {
              void refreshList();
            }}
            disabled={mutationPending || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh list"}
          </Button>
          <Button
            id="add-print-button"
            type="button"
            onClick={openCreate}
            disabled={createOpen || mutationPending || refreshing}
          >
            Add a print
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="carbon-status-message">
        {statusMessage}
      </p>

      {uncertaintyGuard && (
        <div role="alert" className="carbon-feedback carbon-feedback-warning">
          <p>
            A previous change may have completed without confirmation. Review the current saved list before repeating
            any action.
          </p>
          <div className="carbon-feedback-actions">
            <Button
              type="button"
              variant="outline"
              className="whitespace-normal"
              onClick={() => {
                void refreshList();
              }}
              disabled={mutationPending || refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh and review prints"}
            </Button>
          </div>
        </div>
      )}

      {listError && (
        <div role="alert" className="carbon-feedback carbon-feedback-error">
          <p>{listError.message}</p>
          {listError.kind === "unauthenticated" && (
            <a className="carbon-feedback-link" href="/auth/signin">
              Sign in
            </a>
          )}
          <div className="carbon-feedback-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void refreshList();
              }}
              disabled={mutationPending || refreshing}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {createOpen && (
        <section aria-labelledby="create-print-heading" className="carbon-inline-panel">
          <h3 id="create-print-heading" className="mb-4 text-lg font-semibold">
            Add a planned print
          </h3>
          <PrintForm
            mode="create"
            mutationPending={mutationPending}
            mutationGuarded={uncertaintyGuard}
            onPendingChange={updateMutationPending}
            onSaved={(saved) => {
              savePrint(saved, "create");
            }}
            onCancel={closeCreate}
            onUncertain={handleUncertainMutation}
            onRefreshLatest={() => refreshList()}
          />
        </section>
      )}

      {prints.length === 0 ? (
        <div className="carbon-empty-state">
          <h3 className="text-lg font-medium">No planned prints yet</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Add a print to record its material, colour, and required filament.
          </p>
        </div>
      ) : (
        <ul className="carbon-row-list">
          {prints.map((print) => {
            const isEditing = editingPrintId === print.id;
            const isDeleting = deletePrintId === print.id;
            const summary = describePrint(print);
            return (
              <li key={print.id}>
                <article aria-labelledby={`print-title-${print.id}`} className="carbon-collection-row">
                  <div className="carbon-row-main">
                    <p className="carbon-label">Planned print</p>
                    <h3 id={`print-title-${print.id}`} className="carbon-row-title mt-1 text-lg font-semibold">
                      {summary}
                    </h3>
                    {print.name && (
                      <p className="carbon-row-secondary text-muted-foreground mt-1 text-sm">
                        {print.material} <span aria-hidden="true">·</span> {print.colour}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-2 text-xs break-all">
                      Print <code className="font-mono">{print.id}</code>
                    </p>
                  </div>

                  <dl className="carbon-row-values">
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Material</dt>
                      <dd className="carbon-row-secondary mt-1 text-sm">{print.material}</dd>
                    </div>
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Colour</dt>
                      <dd className="carbon-row-secondary mt-1 text-sm">{print.colour}</dd>
                    </div>
                    <div className="carbon-row-value">
                      <dt className="carbon-label">Required</dt>
                      <dd className="carbon-value mt-1 text-lg">{print.requiredGrams} g</dd>
                      <p className="text-muted-foreground mt-1 text-xs">Before safety margin</p>
                    </div>
                  </dl>

                  {!isEditing && !isDeleting && (
                    <div className="carbon-row-actions">
                      <Button
                        id={`${print.reservation ? "manage-reservation" : "reserve-material"}-${print.id}`}
                        type="button"
                        size="sm"
                        variant={print.reservation ? "outline" : "default"}
                        disabled={mutationPending || refreshing || uncertaintyGuard}
                        onClick={() => {
                          openReservation(print);
                        }}
                      >
                        {print.reservation ? "Manage reservation" : "Reserve material"}
                      </Button>
                      <Button
                        id={`edit-print-${print.id}`}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={mutationPending || refreshing || uncertaintyGuard}
                        onClick={() => {
                          openEdit(print.id);
                        }}
                        aria-label={`Edit planned print ${shortId(print.id)}`}
                      >
                        Edit
                      </Button>
                      <Button
                        id={`delete-print-${print.id}`}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={mutationPending || refreshing || uncertaintyGuard}
                        onClick={() => {
                          openDelete(print.id);
                        }}
                        aria-label={`Delete planned print ${shortId(print.id)}`}
                      >
                        Delete
                      </Button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="carbon-inline-panel carbon-row-inline-panel">
                      <h4 className="mb-4 text-base font-semibold">Edit planned print</h4>
                      <PrintForm
                        key={`${print.id}-${print.version}`}
                        mode="edit"
                        print={print}
                        mutationPending={mutationPending}
                        mutationGuarded={uncertaintyGuard}
                        onPendingChange={updateMutationPending}
                        onSaved={(saved) => {
                          savePrint(saved, "edit");
                        }}
                        onCancel={() => {
                          closeEdit(print.id);
                        }}
                        onUncertain={handleUncertainMutation}
                        onRefreshLatest={() => refreshList({ conflictId: print.id })}
                      />
                    </div>
                  )}

                  {isDeleting && (
                    <div
                      className="carbon-inline-panel carbon-inline-panel-warning carbon-row-inline-panel"
                      aria-labelledby={`delete-confirmation-${print.id}`}
                    >
                      <h4 id={`delete-confirmation-${print.id}`} className="font-semibold">
                        Delete this planned print?
                      </h4>
                      <p className="carbon-row-secondary text-muted-foreground mt-2 text-sm leading-relaxed">
                        Confirm deletion of {summary}. Full print ID:{" "}
                        <code className="font-mono break-all">{print.id}</code>
                      </p>
                      {deleteError && (
                        <div role="alert" className="carbon-feedback carbon-feedback-error mt-3">
                          <p>{deleteError.message}</p>
                          {deleteError.kind === "unauthenticated" && (
                            <a className="carbon-feedback-link" href="/auth/signin">
                              Sign in
                            </a>
                          )}
                        </div>
                      )}
                      <div className="carbon-form-actions mt-4">
                        <Button
                          id={`confirm-delete-${print.id}`}
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            void confirmDelete(print);
                          }}
                          disabled={mutationPending || refreshing || uncertaintyGuard}
                        >
                          {deletePending ? "Deleting…" : "Confirm deletion"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            closeDelete(print.id);
                          }}
                          disabled={mutationPending || refreshing}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p role="status" aria-live="polite" className="sr-only">
                        {deletePending ? `Deleting ${summary}.` : ""}
                      </p>
                    </div>
                  )}

                  {reservationPrintId === print.id && !isEditing && !isDeleting && (
                    <ReservationPanel
                      print={print}
                      preview={reservationPreview}
                      previewLoading={reservationPreviewLoading}
                      selectedSpoolId={selectedSpoolId}
                      pending={reservationPending || uncertaintyGuard}
                      error={reservationError}
                      onSelectSpool={(spoolId) => {
                        setSelectedSpoolId(spoolId);
                        setReservationSelectionMode("manual");
                      }}
                      onReserve={() => void confirmReservation(print)}
                      onCancelReservation={() => void releaseReservation(print)}
                      onRefreshPreview={() => void loadReservationPreview(print.id)}
                      onClose={() => {
                        setReservationPrintId(null);
                      }}
                      spoolForReservation={reservationPreview?.eligibleSpools.find(
                        (spool) => spool.id === print.reservation?.spoolId,
                      )}
                    />
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

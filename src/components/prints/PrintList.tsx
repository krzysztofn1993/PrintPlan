import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrintForm } from "@/components/prints/PrintForm";
import { MAX_REQUIRED_GRAMS, isValidPrintId } from "@/lib/print-validation";
import type { PrintDto } from "@/lib/prints";

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
  return typeof value === "object" && value !== null;
}

function readPrint(value: unknown): PrintDto | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, material, colour, requiredGrams, version, createdAt, updatedAt } = value;
  if (
    typeof id !== "string" ||
    !isValidPrintId(id) ||
    (name !== null && typeof name !== "string") ||
    typeof material !== "string" ||
    typeof colour !== "string" ||
    typeof requiredGrams !== "number" ||
    !Number.isSafeInteger(requiredGrams) ||
    requiredGrams < 1 ||
    requiredGrams > MAX_REQUIRED_GRAMS ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > MAX_REQUIRED_GRAMS ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return undefined;
  }
  return { id, name, material, colour, requiredGrams, version, createdAt, updatedAt };
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
    if (mutationPendingRef.current || refreshingRef.current) return;
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setEditingPrintId(null);
    setCreateOpen(true);
  }

  function openEdit(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingPrintId(printId);
  }

  function closeCreate() {
    if (mutationPendingRef.current || refreshingRef.current) return;
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
    const refreshed = values.map(readPrint);
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
      setStatusMessage(`${describePrint(print)} deleted.`);
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
    <section aria-labelledby="prints-list-heading" className="carbon-panel min-w-0 space-y-5 p-4 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="carbon-label">Your queue</p>
          <h2 id="prints-list-heading" className="mt-1 text-xl font-semibold">
            Planned prints
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Each print stays independent, even when its name or requirements match another.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            id="refresh-prints-button"
            type="button"
            variant="outline"
            className="min-h-11"
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
            className="min-h-11"
            onClick={openCreate}
            disabled={createOpen || mutationPending || refreshing}
          >
            Add a print
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-success min-h-5 text-sm">
        {statusMessage}
      </p>

      {uncertaintyGuard && (
        <div role="alert" className="border-warning/50 bg-warning-surface text-warning rounded-md border p-4 text-sm">
          <p>
            A previous change may have completed without confirmation. Review the current saved list before repeating
            any action.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11 whitespace-normal"
            onClick={() => {
              void refreshList();
            }}
            disabled={mutationPending || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh and review prints"}
          </Button>
        </div>
      )}

      {listError && (
        <div
          role="alert"
          className="border-destructive/50 bg-error-surface text-error-foreground rounded-md border p-4 text-sm"
        >
          <p>{listError.message}</p>
          {listError.kind === "unauthenticated" && (
            <a
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              href="/auth/signin"
            >
              Sign in
            </a>
          )}
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => {
              void refreshList({ conflictId: editingPrintId ?? undefined });
            }}
            disabled={mutationPending || refreshing}
          >
            Try again
          </Button>
        </div>
      )}

      {createOpen && (
        <section aria-labelledby="create-print-heading" className="border-border bg-card rounded-lg border p-4 sm:p-5">
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
        <div className="border-border bg-muted/40 rounded-lg border border-dashed p-6 text-center sm:p-8">
          <h3 className="text-lg font-medium">No planned prints yet</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Add a print to record its material, colour, and required filament.
          </p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
          {prints.map((print) => {
            const isEditing = editingPrintId === print.id;
            const isDeleting = deletePrintId === print.id;
            const summary = describePrint(print);
            return (
              <li key={print.id} className="border-border bg-card min-w-0 rounded-lg border p-4 sm:p-5">
                <article aria-labelledby={`print-title-${print.id}`} className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="carbon-label">Planned print</p>
                      <h3
                        id={`print-title-${print.id}`}
                        className="mt-1 text-lg font-semibold [overflow-wrap:anywhere] break-words"
                      >
                        {summary}
                      </h3>
                      {print.name && (
                        <p className="text-muted-foreground mt-1 text-sm [overflow-wrap:anywhere] break-words">
                          {print.material} <span aria-hidden="true">·</span> {print.colour}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-2 text-xs break-all">
                        Print <code className="font-mono">{print.id}</code>
                      </p>
                    </div>
                    {!isEditing && !isDeleting && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          id={`edit-print-${print.id}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11 min-w-11"
                          disabled={mutationPending || refreshing}
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
                          className="min-h-11 min-w-11"
                          disabled={mutationPending || refreshing}
                          onClick={() => {
                            openDelete(print.id);
                          }}
                          aria-label={`Delete planned print ${shortId(print.id)}`}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="bg-muted/50 min-w-0 rounded-md p-3">
                      <dt className="carbon-label">Material</dt>
                      <dd className="mt-1 text-sm [overflow-wrap:anywhere] break-words">{print.material}</dd>
                    </div>
                    <div className="bg-muted/50 min-w-0 rounded-md p-3">
                      <dt className="carbon-label">Colour</dt>
                      <dd className="mt-1 text-sm [overflow-wrap:anywhere] break-words">{print.colour}</dd>
                    </div>
                    <div className="bg-muted/50 min-w-0 rounded-md p-3">
                      <dt className="carbon-label">Required</dt>
                      <dd className="carbon-value mt-1 text-lg break-words">{print.requiredGrams} g</dd>
                      <p className="text-muted-foreground mt-1 text-xs">Before safety margin</p>
                    </div>
                  </dl>

                  {isEditing && (
                    <div className="border-border bg-background mt-4 rounded-md border p-4">
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
                      className="border-warning/50 bg-warning-surface mt-4 rounded-md border p-4"
                      aria-labelledby={`delete-confirmation-${print.id}`}
                    >
                      <h4 id={`delete-confirmation-${print.id}`} className="font-semibold">
                        Delete this planned print?
                      </h4>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed [overflow-wrap:anywhere] break-words">
                        Confirm deletion of {summary}. Full print ID:{" "}
                        <code className="font-mono break-all">{print.id}</code>
                      </p>
                      {deleteError && (
                        <div
                          role="alert"
                          className="border-destructive/50 bg-error-surface text-error-foreground mt-3 rounded-md border p-3 text-sm"
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
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          id={`confirm-delete-${print.id}`}
                          type="button"
                          variant="destructive"
                          className="min-h-11"
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
                          className="min-h-11"
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
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

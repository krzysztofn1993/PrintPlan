import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrintForm } from "@/components/prints/PrintForm";
import { ReservationPanel } from "@/components/prints/ReservationPanel";
import { SettlementPanel } from "@/components/prints/SettlementPanel";
import { readPrintDto } from "@/lib/print-dto";
import type { PrintDto } from "@/lib/prints";
import type { ReservationPreview } from "@/lib/reservations";
import { MAX_ACTUAL_GRAMS } from "@/lib/settlement-validation";
import { readSettlementReceipt, type SettlementReceipt } from "@/lib/settlement-dto";
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

interface SettlementCommand {
  printId: string;
  requestId: string;
  expectedVersion: number;
  reservationId: string;
  actualGrams: number;
  submittedText: string;
}

type SettlementWorkflowState = "editing" | "pending" | "uncertain" | "rejected" | "loading" | "receipt";

interface SettlementWorkflow {
  print: PrintDto;
  printAvailable: boolean;
  draftText: string;
  command: SettlementCommand | null;
  state: SettlementWorkflowState;
  receipt: SettlementReceipt | null;
  receiptMatchesCommand: boolean;
  reconciliation: "idle" | "pending" | "failed" | "complete";
  reservedSpool: SpoolDto | null;
  currentSpool: SpoolDto | null;
  currentSpoolDeleted: boolean;
  error: string;
  fieldError: string;
  signInRequired: boolean;
  attemptNote: string;
}

type CollectionRead<T> = { ok: true; value: T[] } | { ok: false; message: string; unauthenticated: boolean };

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

function parseActualGrams(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const grams = Number(value);
  return Number.isSafeInteger(grams) && grams >= 0 && grams <= MAX_ACTUAL_GRAMS ? grams : undefined;
}

async function readCollection<T>(
  endpoint: string,
  key: "prints" | "spools",
  decoder: (value: unknown) => T | undefined,
  collectionName: string,
): Promise<CollectionRead<T>> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "GET", cache: "no-store" });
  } catch {
    return { ok: false, message: `The current ${collectionName} could not be reached.`, unauthenticated: false };
  }
  if (!response.ok) {
    return {
      ok: false,
      message:
        response.status === 401
          ? "Your session has expired. Sign in to continue."
          : `The current ${collectionName} could not be read.`,
      unauthenticated: response.status === 401,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!isRecord(body) || !Array.isArray(body[key])) {
    return { ok: false, message: `The current ${collectionName} response could not be read.`, unauthenticated: false };
  }
  const values = body[key].map(decoder);
  if (values.some((value) => value === undefined)) {
    return { ok: false, message: `The current ${collectionName} response could not be read.`, unauthenticated: false };
  }
  return { ok: true, value: values as T[] };
}

function receiptMatchesCommand(receipt: SettlementReceipt, command: SettlementCommand): boolean {
  return (
    receipt.requestId.toLowerCase() === command.requestId.toLowerCase() &&
    receipt.printId.toLowerCase() === command.printId.toLowerCase() &&
    receipt.expectedVersion === command.expectedVersion &&
    receipt.reservationId.toLowerCase() === command.reservationId.toLowerCase() &&
    receipt.actualGrams === command.actualGrams
  );
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
  const [settlementPanelPrintId, setSettlementPanelPrintId] = useState<string | null>(null);
  const [settlementWorkflows, setSettlementWorkflows] = useState<Record<string, SettlementWorkflow>>({});
  const [settlementGuard, setSettlementGuard] = useState(false);
  const focusTarget = useRef<string | null>(null);
  const mutationPendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const reservationPrintIdRef = useRef<string | null>(null);
  const reservationPreviewRequestRef = useRef(0);
  const settlementWorkflowsRef = useRef<Record<string, SettlementWorkflow>>({});
  const settlementGuardRef = useRef(false);
  const settlementPanelPrintIdRef = useRef<string | null>(null);
  const settlementPanelRequestRef = useRef<Record<string, number>>({});
  const settlementReconciliationRequestRef = useRef<Record<string, number>>({});

  useEffect(
    () => () => {
      reservationPrintIdRef.current = null;
      reservationPreviewRequestRef.current += 1;
      settlementPanelRequestRef.current = {};
      settlementReconciliationRequestRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    document.getElementById(target)?.focus();
    focusTarget.current = null;
  }, [createOpen, editingPrintId, deletePrintId, prints, settlementPanelPrintId]);

  function updateMutationPending(pending: boolean) {
    mutationPendingRef.current = pending;
    setMutationPending(pending);
  }

  function updateDeletePending(pending: boolean) {
    setDeletePending(pending);
    updateMutationPending(pending);
  }

  function updateSettlementWorkflow(printId: string, update: (current: SettlementWorkflow) => SettlementWorkflow) {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const current = settlementWorkflowsRef.current[printId];
    const next = { ...settlementWorkflowsRef.current, [printId]: update(current) };
    settlementWorkflowsRef.current = next;
    setSettlementWorkflows(next);
  }

  function createSettlementWorkflow(print: PrintDto): SettlementWorkflow {
    return {
      print,
      printAvailable: true,
      draftText: "",
      command: null,
      state: "editing",
      receipt: null,
      receiptMatchesCommand: false,
      reconciliation: "idle",
      reservedSpool: null,
      currentSpool: null,
      currentSpoolDeleted: false,
      error: "",
      fieldError: "",
      signInRequired: false,
      attemptNote: "",
    };
  }

  function updateSettlementGuard(guarded: boolean) {
    settlementGuardRef.current = guarded;
    setSettlementGuard(guarded);
  }

  function settlementWorkflowIsBlocking(workflow: SettlementWorkflow): boolean {
    return (
      workflow.state === "uncertain" ||
      workflow.state === "loading" ||
      workflow.reconciliation === "pending" ||
      workflow.reconciliation === "failed"
    );
  }

  function updateSettlementDraft(printId: string, value: string) {
    updateSettlementWorkflow(printId, (workflow) => {
      if (workflow.state === "pending" || workflow.state === "uncertain" || workflow.receipt) return workflow;
      const startsNewAttempt = workflow.state === "rejected" && value !== workflow.command?.submittedText;
      return {
        ...workflow,
        draftText: value,
        command: startsNewAttempt ? null : workflow.command,
        state: startsNewAttempt ? "editing" : workflow.state,
        error: startsNewAttempt ? "" : workflow.error,
        fieldError: "",
        signInRequired: false,
        attemptNote: startsNewAttempt ? "" : workflow.attemptNote,
      };
    });
  }

  function failSettlementCollectionRead(printId: string, message: string, unauthenticated: boolean) {
    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      reconciliation: "failed",
      currentSpool: null,
      currentSpoolDeleted: false,
      error: message,
      signInRequired: unauthenticated,
    }));
    updateSettlementGuard(true);
  }

  async function readSettlementCollections(printId: string, rejectionMessage?: string) {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const requestId = (settlementReconciliationRequestRef.current[printId] ?? 0) + 1;
    settlementReconciliationRequestRef.current[printId] = requestId;
    updateSettlementGuard(true);
    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      reconciliation: "pending",
      currentSpool: null,
      currentSpoolDeleted: false,
      error: rejectionMessage ?? "",
      signInRequired: false,
    }));

    const [printResult, spoolResult] = await Promise.all([
      readCollection("/api/prints", "prints", readPrintDto, "print list"),
      readCollection("/api/spools", "spools", readSpoolDto, "spool inventory"),
    ]);
    if (settlementReconciliationRequestRef.current[printId] !== requestId) return;

    if (!printResult.ok) {
      failSettlementCollectionRead(printId, printResult.message, printResult.unauthenticated);
      return;
    }
    if (!spoolResult.ok) {
      failSettlementCollectionRead(printId, spoolResult.message, spoolResult.unauthenticated);
      return;
    }
    setPrints(orderedPrints(printResult.value));
    const currentPrint = printResult.value.find((print) => print.id === printId);
    const receipt = settlementWorkflowsRef.current[printId].receipt;
    const currentSpool = receipt ? spoolResult.value.find((spool) => spool.id === receipt.spool.id) : undefined;

    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      reconciliation: "complete",
      print: currentPrint ?? current.print,
      printAvailable: Boolean(currentPrint),
      currentSpool: current.receipt ? (currentSpool ?? null) : null,
      currentSpoolDeleted: Boolean(current.receipt && !currentSpool),
      error: rejectionMessage ?? "",
      fieldError: current.fieldError,
      signInRequired: false,
      attemptNote: current.receipt
        ? current.attemptNote
        : rejectionMessage
          ? "This settlement attempt was not applied. The current print and stock were read successfully."
          : current.attemptNote,
      state: current.receipt ? "receipt" : rejectionMessage ? "rejected" : current.state,
    }));
    updateSettlementGuard(false);
    if (!receipt && currentPrint?.settlement) void checkSettlementStatus(printId);
  }

  async function acceptSettlementReceipt(printId: string, receipt: SettlementReceipt, note = "") {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const workflow = settlementWorkflowsRef.current[printId];
    if (receipt.printId.toLowerCase() !== printId.toLowerCase()) return;
    const matchesCommand = workflow.command ? receiptMatchesCommand(receipt, workflow.command) : false;
    updateSettlementGuard(true);
    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      state: "receipt",
      receipt,
      receiptMatchesCommand: matchesCommand,
      reconciliation: "pending",
      currentSpool: null,
      currentSpoolDeleted: false,
      error: "",
      fieldError: "",
      signInRequired: false,
      attemptNote:
        note.length > 0
          ? note
          : current.command && !matchesCommand
            ? "This print already has a saved settlement. The amount in the current attempt was not applied."
            : "",
    }));
    await readSettlementCollections(printId);
  }

  async function checkSettlementStatus(printId: string) {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const workflow = settlementWorkflowsRef.current[printId];
    if (mutationPendingRef.current || refreshingRef.current) return;
    if (workflow.receipt) {
      await readSettlementCollections(printId);
      return;
    }
    const requestId = (settlementPanelRequestRef.current[printId] ?? 0) + 1;
    settlementPanelRequestRef.current[printId] = requestId;
    updateSettlementGuard(true);
    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      state: "loading",
      error: "",
      signInRequired: false,
    }));

    let response: Response;
    try {
      response = await fetch(`/api/prints/${printId}/settlement`, { method: "GET", cache: "no-store" });
    } catch {
      if (settlementPanelRequestRef.current[printId] !== requestId) return;
      updateSettlementWorkflow(printId, (current) => ({
        ...current,
        state: "uncertain",
        error: "The saved settlement result could not be reached. Keep the command and try reading it again.",
      }));
      updateSettlementGuard(true);
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (settlementPanelRequestRef.current[printId] !== requestId) return;
    if (response.ok && isRecord(body) && Object.hasOwn(body, "settlement")) {
      if (body.settlement === null) {
        updateSettlementWorkflow(printId, (current) => ({
          ...current,
          state: "uncertain",
          error: current.command
            ? "No saved receipt is visible yet. An earlier request may still commit; retry the exact same command to resolve it safely."
            : "The completed print has no readable saved receipt yet. Try reading the result again.",
        }));
        updateSettlementGuard(true);
        return;
      }
      const receipt = readSettlementReceipt(body.settlement);
      if (receipt?.printId.toLowerCase() === printId.toLowerCase()) {
        await acceptSettlementReceipt(printId, receipt);
        return;
      }
    }

    const unauthenticated = response.status === 401;
    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      state: "uncertain",
      error: unauthenticated
        ? "Your session has expired. Sign in to retrieve the saved settlement result."
        : response.status === 404
          ? "The saved settlement result could not be found. Keep this recovery state and try reading it again."
          : "The saved settlement result could not be read. Keep this recovery state and try again.",
      signInRequired: unauthenticated,
    }));
    updateSettlementGuard(true);
  }

  async function submitSettlement(printId: string, replay = false) {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const workflow = settlementWorkflowsRef.current[printId];
    const isExactRecovery = Boolean(replay && workflow.command && workflow.state === "uncertain");
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      (settlementGuardRef.current && !isExactRecovery)
    )
      return;
    let command = replay ? workflow.command : null;
    if (replay && (!command || workflow.state !== "uncertain")) return;
    if (!command) {
      const actualGrams = parseActualGrams(workflow.draftText);
      if (actualGrams === undefined) {
        updateSettlementWorkflow(printId, (current) => ({
          ...current,
          fieldError: "Enter whole grams using digits only, from 0 to 2,147,483,647.",
          error: "",
        }));
        return;
      }
      const print = prints.find((item) => item.id === printId) ?? workflow.print;
      if (!print.reservation || print.settlement) {
        updateSettlementWorkflow(printId, (current) => ({
          ...current,
          state: "rejected",
          error:
            "This print no longer has the active reservation required for settlement. Read the current print and stock before trying again.",
        }));
        updateSettlementGuard(true);
        await readSettlementCollections(printId, "This settlement attempt was not applied.");
        return;
      }
      command = {
        printId,
        requestId: crypto.randomUUID(),
        expectedVersion: print.version,
        reservationId: print.reservation.id,
        actualGrams,
        submittedText: workflow.draftText,
      };
    }

    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      print: prints.find((item) => item.id === printId) ?? current.print,
      command,
      state: "pending",
      error: "",
      fieldError: "",
      signInRequired: false,
      attemptNote: "",
    }));
    updateMutationPending(true);

    let response: Response;
    try {
      response = await fetch(`/api/prints/${printId}/settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          requestId: command.requestId,
          expectedVersion: String(command.expectedVersion),
          reservationId: command.reservationId,
          actualGrams: String(command.actualGrams),
        }),
      });
    } catch {
      updateMutationPending(false);
      updateSettlementWorkflow(printId, (current) => ({
        ...current,
        state: "uncertain",
        error: "We couldn't confirm whether settlement completed. Read the saved result before changing this command.",
      }));
      updateSettlementGuard(true);
      void checkSettlementStatus(printId);
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.status === 200 && response.ok && isRecord(body) && typeof body.replayed === "boolean") {
      const receipt = readSettlementReceipt(body.settlement);
      if (receipt && receiptMatchesCommand(receipt, command)) {
        updateMutationPending(false);
        await acceptSettlementReceipt(printId, receipt);
        return;
      }
    }

    updateMutationPending(false);
    const errorBody = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const errorCode = errorBody?.code;
    if (response.status === 409 && (errorCode === "already_settled" || errorCode === "print_settled")) {
      updateSettlementWorkflow(printId, (current) => ({
        ...current,
        state: "uncertain",
        error:
          "This print already has a saved settlement. Reading that result; the submitted amount is not treated as applied.",
      }));
      updateSettlementGuard(true);
      void checkSettlementStatus(printId);
      return;
    }

    if (response.status === 401) {
      updateSettlementWorkflow(printId, (current) => ({
        ...current,
        state: "uncertain",
        error: "Your session has expired. Sign in to check whether this exact command has a saved result.",
        signInRequired: true,
      }));
      updateSettlementGuard(true);
      return;
    }

    const definitiveConflict =
      response.status === 404 ||
      (response.status === 409 &&
        ["edit_conflict", "reservation_changed", "reservation_required"].includes(String(errorCode)));
    if (response.status === 422 || definitiveConflict) {
      const fieldErrors = isRecord(errorBody?.fieldErrors) ? errorBody.fieldErrors : undefined;
      const actualError = fieldErrors && isRecord(fieldErrors.actualGrams) ? fieldErrors.actualGrams.code : undefined;
      const rejectionMessage =
        actualError === "required"
          ? "Enter actual grams before settling this print."
          : actualError === "invalid" || actualError === "out_of_range"
            ? "Enter whole grams using digits only, from 0 to 2,147,483,647."
            : response.status === 404
              ? "This print is no longer available for settlement."
              : errorCode === "reservation_required" || errorCode === "reservation_changed"
                ? "The original reservation is no longer active. Review the current print before starting another attempt."
                : "The print changed before settlement. Review the current print before starting another attempt.";
      updateSettlementWorkflow(printId, (current) => ({
        ...current,
        state: "rejected",
        error: rejectionMessage,
        fieldError: actualError ? rejectionMessage : "",
        attemptNote: "This settlement attempt was not applied.",
      }));
      updateSettlementGuard(true);
      await readSettlementCollections(printId, rejectionMessage);
      return;
    }

    updateSettlementWorkflow(printId, (current) => ({
      ...current,
      state: "uncertain",
      error:
        response.status >= 500 || response.ok
          ? "The settlement may have completed, but its result was not readable. Read the saved result before trying another command."
          : "The settlement result is unclear. Read the saved result before changing this command.",
    }));
    updateSettlementGuard(true);
    void checkSettlementStatus(printId);
  }

  async function retrySettlementRecovery(printId: string) {
    if (!Object.hasOwn(settlementWorkflowsRef.current, printId)) return;
    const workflow = settlementWorkflowsRef.current[printId];
    if (mutationPendingRef.current || refreshingRef.current) return;
    if (workflow.receipt || workflow.state === "rejected") {
      await readSettlementCollections(printId, workflow.receipt ? undefined : workflow.error);
      return;
    }
    await checkSettlementStatus(printId);
  }

  function invalidateReservationPreview() {
    reservationPreviewRequestRef.current += 1;
    setReservationPreviewLoading(false);
  }

  function closeReservation() {
    invalidateReservationPreview();
    reservationPrintIdRef.current = null;
    setReservationPrintId(null);
    setReservationPreview(null);
    setSelectedSpoolId("");
    setReservationError("");
  }

  async function loadReservedSpool(printId: string, spoolId: string) {
    const requestId = (settlementPanelRequestRef.current[printId] ?? 0) + 1;
    settlementPanelRequestRef.current[printId] = requestId;
    const result = await readCollection("/api/spools", "spools", readSpoolDto, "spool inventory");
    if (
      settlementPanelRequestRef.current[printId] !== requestId ||
      settlementPanelPrintIdRef.current !== printId ||
      !result.ok
    )
      return;
    updateSettlementWorkflow(printId, (workflow) => ({
      ...workflow,
      reservedSpool: result.value.find((spool) => spool.id === spoolId) ?? null,
    }));
  }

  function openSettlement(print: PrintDto) {
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      createOpen ||
      editingPrintId ||
      deletePrintId
    )
      return;
    closeReservation();
    setStatusMessage("");
    setDeleteError(null);
    const hasWorkflow = Object.hasOwn(settlementWorkflowsRef.current, print.id);
    if (hasWorkflow) {
      const existing = settlementWorkflowsRef.current[print.id];
      const next = {
        ...settlementWorkflowsRef.current,
        [print.id]: { ...existing, print: existing.receipt ? existing.print : print },
      };
      settlementWorkflowsRef.current = next;
      setSettlementWorkflows(next);
    } else {
      const next = { ...settlementWorkflowsRef.current, [print.id]: createSettlementWorkflow(print) };
      settlementWorkflowsRef.current = next;
      setSettlementWorkflows(next);
    }
    setSettlementPanelPrintId(print.id);
    settlementPanelPrintIdRef.current = print.id;
    focusTarget.current = `settlement-heading-${print.id}`;
    if (print.settlement || settlementWorkflowsRef.current[print.id].receipt) {
      void checkSettlementStatus(print.id);
    } else if (print.reservation && !settlementWorkflowsRef.current[print.id].receipt) {
      void loadReservedSpool(print.id, print.reservation.spoolId);
    }
  }

  function closeSettlement(printId: string) {
    if (mutationPendingRef.current) return;
    settlementPanelRequestRef.current[printId] = (settlementPanelRequestRef.current[printId] ?? 0) + 1;
    if (Object.hasOwn(settlementWorkflowsRef.current, printId)) {
      updateSettlementWorkflow(printId, (workflow) =>
        workflow.state === "loading" && !workflow.receipt
          ? {
              ...workflow,
              state: "uncertain",
              error: "Settlement status checking paused when the panel closed. Reopen it to continue recovery.",
            }
          : workflow,
      );
    }
    settlementPanelPrintIdRef.current = null;
    setSettlementPanelPrintId(null);
    const currentPrint = prints.find((print) => print.id === printId);
    const hasReviewControl =
      !settlementGuardRef.current &&
      !uncertaintyGuard &&
      !refreshingRef.current &&
      (Boolean(currentPrint?.settlement) ||
        (!currentPrint && Boolean(settlementWorkflowsRef.current[printId].receipt)));
    focusTarget.current = hasReviewControl ? `review-settlement-${printId}` : "prints-list-heading";
  }

  function openCreate() {
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
    closeReservation();
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setEditingPrintId(null);
    setCreateOpen(true);
  }

  function openEdit(printId: string) {
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
    closeReservation();
    setStatusMessage("");
    setDeletePrintId(null);
    setDeleteError(null);
    setCreateOpen(false);
    setEditingPrintId(printId);
  }

  function closeCreate() {
    if (mutationPendingRef.current || refreshingRef.current || uncertaintyGuard || settlementGuardRef.current) return;
    focusTarget.current = "add-print-button";
    setCreateOpen(false);
  }

  function closeEdit(printId: string) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    focusTarget.current = `edit-print-${printId}`;
    setEditingPrintId(null);
  }

  function openDelete(printId: string) {
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
    closeReservation();
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
    const visibleSettlement = settlementPanelPrintId
      ? settlementWorkflowsRef.current[settlementPanelPrintId]
      : undefined;
    if (settlementGuardRef.current || visibleSettlement?.receipt) {
      if (visibleSettlement && visibleSettlement.state !== "loading") {
        await retrySettlementRecovery(visibleSettlement.print.id);
      } else {
        const guarded = Object.values(settlementWorkflowsRef.current).find(settlementWorkflowIsBlocking);
        if (guarded && guarded.state !== "loading") await retrySettlementRecovery(guarded.print.id);
      }
      return false;
    }
    if (!options.conflictId && (createOpen || editingPrintId || deletePrintId)) {
      const accepted = window.confirm("Refreshing the list will discard unsaved form entries. Continue?");
      if (!accepted) return false;
    }
    refreshingRef.current = true;
    invalidateReservationPreview();
    if (visibleSettlement) {
      settlementPanelRequestRef.current[visibleSettlement.print.id] =
        (settlementPanelRequestRef.current[visibleSettlement.print.id] ?? 0) + 1;
      updateSettlementWorkflow(visibleSettlement.print.id, (workflow) => ({ ...workflow, reservedSpool: null }));
    }
    setRefreshing(true);
    const refreshed = await fetchLatestPrints();
    refreshingRef.current = false;
    setRefreshing(false);
    if (!refreshed) return false;

    setPrints(refreshed);
    if (visibleSettlement) {
      const currentPrint = refreshed.find((print) => print.id === visibleSettlement.print.id);
      updateSettlementWorkflow(visibleSettlement.print.id, (workflow) => ({
        ...workflow,
        print: currentPrint ?? workflow.print,
        printAvailable: Boolean(currentPrint),
      }));
      if (currentPrint?.settlement) {
        void checkSettlementStatus(currentPrint.id);
      } else if (currentPrint?.reservation && !visibleSettlement.receipt) {
        void loadReservedSpool(currentPrint.id, currentPrint.reservation.spoolId);
      }
    }
    setUncertaintyGuard(false);
    closeReservation();
    setDeleteError(null);
    setDeletePrintId(null);
    setCreateOpen(false);
    setEditingPrintId(
      options.conflictId && refreshed.some((print) => print.id === options.conflictId) ? options.conflictId : null,
    );
    if (!visibleSettlement?.receipt) {
      setStatusMessage("Print list refreshed. Review the current saved prints before making another change.");
      if (options.conflictId && !refreshed.some((print) => print.id === options.conflictId)) {
        setStatusMessage("Print list refreshed. This print is no longer available.");
      }
      focusTarget.current =
        options.conflictId && refreshed.some((print) => print.id === options.conflictId)
          ? `edit-print-${options.conflictId}`
          : "add-print-button";
    }
    return true;
  }

  async function loadReservationPreview(printId: string) {
    if (reservationPrintIdRef.current !== printId || refreshingRef.current) return;
    const requestId = ++reservationPreviewRequestRef.current;
    const isCurrentPreview = () =>
      reservationPreviewRequestRef.current === requestId && reservationPrintIdRef.current === printId;
    setReservationPreview(null);
    setReservationPreviewLoading(true);
    setReservationError("");
    let response: Response;
    try {
      response = await fetch(`/api/prints/${printId}/reservation`, { method: "GET", cache: "no-store" });
    } catch {
      if (!isCurrentPreview()) return;
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
    if (!isCurrentPreview()) return;
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
      return;
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
    if (
      print.settlement ||
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
    closeReservation();
    reservationPrintIdRef.current = print.id;
    setReservationPrintId(print.id);
    if (!print.reservation) void loadReservationPreview(print.id);
  }

  async function confirmReservation(print: PrintDto) {
    const preview = reservationPreview;
    if (
      preview?.printId !== print.id ||
      reservationPrintIdRef.current !== print.id ||
      !selectedSpoolId ||
      reservationPreviewLoading ||
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
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
        closeReservation();
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
    if (
      !reservationId ||
      mutationPendingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
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
        closeReservation();
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
    if (
      mutationPendingRef.current ||
      refreshingRef.current ||
      uncertaintyGuard ||
      settlementGuardRef.current ||
      settlementPanelPrintId
    )
      return;
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
      if (print.settlement) {
        const workflow = Object.hasOwn(settlementWorkflowsRef.current, print.id)
          ? settlementWorkflowsRef.current[print.id]
          : createSettlementWorkflow(print);
        const next = {
          ...settlementWorkflowsRef.current,
          [print.id]: { ...workflow, print, printAvailable: false },
        };
        settlementWorkflowsRef.current = next;
        setSettlementWorkflows(next);
      }
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
        print.settlement
          ? `${describePrint(print)} deleted. Its saved ${print.settlement.actualGrams} g consumption remains recorded; stock was not refunded.`
          : releasedGrams > 0
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

  const blockingSettlement = Object.values(settlementWorkflows).find(settlementWorkflowIsBlocking);
  const detachedSettlementWorkflows = Object.values(settlementWorkflows).filter(
    (workflow) =>
      !prints.some((print) => print.id === workflow.print.id) &&
      (Boolean(workflow.receipt) || Boolean(workflow.print.settlement) || settlementPanelPrintId === workflow.print.id),
  );

  function renderSettlementPanel(print: PrintDto, workflow: SettlementWorkflow) {
    return (
      <SettlementPanel
        print={print}
        printAvailable={workflow.printAvailable}
        state={workflow.state}
        draftText={workflow.draftText}
        receipt={workflow.receipt}
        reservedSpool={workflow.reservedSpool}
        currentSpool={workflow.currentSpool}
        currentSpoolDeleted={workflow.currentSpoolDeleted}
        error={workflow.error}
        fieldError={workflow.fieldError}
        signInRequired={workflow.signInRequired}
        settlementBlocked={settlementGuard || uncertaintyGuard}
        reconciliationPending={workflow.reconciliation === "pending"}
        canConfirm={
          !workflow.command &&
          Boolean(print.reservation) &&
          !print.settlement &&
          (workflow.state === "editing" || workflow.state === "rejected") &&
          !mutationPending &&
          !refreshing &&
          !uncertaintyGuard &&
          !settlementGuard
        }
        canReplay={Boolean(workflow.command && workflow.state === "uncertain" && !mutationPending && !refreshing)}
        canCheckStatus={workflow.state === "uncertain" && !mutationPending && !refreshing}
        canRetryReconciliation={workflow.reconciliation === "failed" && !mutationPending && !refreshing}
        attemptNote={workflow.attemptNote}
        onDraftChange={(value) => {
          updateSettlementDraft(print.id, value);
        }}
        onConfirm={() => {
          void submitSettlement(print.id);
        }}
        onReplay={() => {
          void submitSettlement(print.id, true);
        }}
        onCheckStatus={() => {
          void checkSettlementStatus(print.id);
        }}
        onRetryReconciliation={() => {
          void retrySettlementRecovery(print.id);
        }}
        onClose={() => {
          closeSettlement(print.id);
        }}
      />
    );
  }

  return (
    <section aria-labelledby="prints-list-heading" className="carbon-collection">
      <div className="carbon-collection-header">
        <div className="carbon-collection-heading">
          <p className="carbon-label">Your queue</p>
          <h2 id="prints-list-heading" className="mt-1 text-xl font-semibold" tabIndex={-1}>
            Prints
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Planned and completed prints stay in this collection. Required grams are an estimate; completed prints show
            actual consumption.
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
            disabled={
              createOpen ||
              mutationPending ||
              refreshing ||
              uncertaintyGuard ||
              settlementGuard ||
              settlementPanelPrintId !== null
            }
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

      {settlementGuard && blockingSettlement && (
        <div role="alert" className="carbon-feedback carbon-feedback-warning">
          <p>
            {blockingSettlement.receipt
              ? "The settlement is saved. Both current collections must be read before another print change is allowed."
              : "A settlement command may have completed. Read its saved result or retry the exact same command before starting another change."}
          </p>
          <div className="carbon-feedback-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => void retrySettlementRecovery(blockingSettlement.print.id)}
              disabled={mutationPending || refreshing || blockingSettlement.state === "loading"}
            >
              {blockingSettlement.receipt ? "Retry current print and stock reads" : "Check saved settlement result"}
            </Button>
            {blockingSettlement.command && blockingSettlement.state === "uncertain" && (
              <Button
                type="button"
                onClick={() => void submitSettlement(blockingSettlement.print.id, true)}
                disabled={mutationPending || refreshing}
              >
                Retry exact settlement
              </Button>
            )}
            {settlementPanelPrintId !== blockingSettlement.print.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  settlementPanelPrintIdRef.current = blockingSettlement.print.id;
                  setSettlementPanelPrintId(blockingSettlement.print.id);
                  focusTarget.current = `settlement-heading-${blockingSettlement.print.id}`;
                }}
              >
                Reopen settlement panel
              </Button>
            )}
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
            mutationGuarded={uncertaintyGuard || settlementGuard}
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
            const settlementWorkflow = settlementWorkflows[print.id];
            const settlementPanelOpen = settlementPanelPrintId === print.id;
            const actionsDisabled =
              mutationPending || refreshing || uncertaintyGuard || settlementGuard || settlementPanelPrintId !== null;
            const summary = describePrint(print);
            return (
              <li key={print.id}>
                <article aria-labelledby={`print-title-${print.id}`} className="carbon-collection-row">
                  <div className="carbon-row-main">
                    <p className="carbon-label">{print.settlement ? "Completed print" : "Planned print"}</p>
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
                      <dt className="carbon-label">Required estimate</dt>
                      <dd className="carbon-value mt-1 text-lg">{print.requiredGrams} g</dd>
                      <p className="text-muted-foreground mt-1 text-xs">Before safety margin</p>
                    </div>
                    {print.settlement && (
                      <div className="carbon-row-value">
                        <dt className="carbon-label">Actual consumption</dt>
                        <dd className="carbon-value mt-1 text-lg">{print.settlement.actualGrams} g</dd>
                        <p className="text-muted-foreground mt-1 text-xs">Completed</p>
                      </div>
                    )}
                  </dl>

                  {!isEditing && !isDeleting && (
                    <div className="carbon-row-actions">
                      {print.settlement ? (
                        <Button
                          id={`review-settlement-${print.id}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={actionsDisabled}
                          onClick={() => {
                            openSettlement(print);
                          }}
                        >
                          Review settlement
                        </Button>
                      ) : (
                        <>
                          {print.reservation && (
                            <Button
                              id={`settle-print-${print.id}`}
                              type="button"
                              size="sm"
                              disabled={actionsDisabled}
                              onClick={() => {
                                openSettlement(print);
                              }}
                            >
                              Settle print
                            </Button>
                          )}
                          <Button
                            id={`${print.reservation ? "manage-reservation" : "reserve-material"}-${print.id}`}
                            type="button"
                            size="sm"
                            variant={print.reservation ? "outline" : "default"}
                            disabled={actionsDisabled}
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
                            disabled={actionsDisabled}
                            onClick={() => {
                              openEdit(print.id);
                            }}
                            aria-label={`Edit planned print ${shortId(print.id)}`}
                          >
                            Edit
                          </Button>
                        </>
                      )}
                      <Button
                        id={`delete-print-${print.id}`}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={actionsDisabled}
                        onClick={() => {
                          openDelete(print.id);
                        }}
                        aria-label={`Delete ${print.settlement ? "completed" : "planned"} print ${shortId(print.id)}`}
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
                        Delete this {print.settlement ? "completed" : "planned"} print?
                      </h4>
                      <p className="carbon-row-secondary text-muted-foreground mt-2 text-sm leading-relaxed">
                        {print.settlement
                          ? `Deleting ${summary} will not reverse its saved ${print.settlement.actualGrams} g consumption or restore stock. `
                          : `Confirm deletion of ${summary}. `}
                        Full print ID: <code className="font-mono break-all">{print.id}</code>
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
                          disabled={mutationPending || refreshing || uncertaintyGuard || settlementGuard}
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

                  {reservationPrintId === print.id &&
                    !isEditing &&
                    !isDeleting &&
                    !print.settlement &&
                    !settlementPanelOpen && (
                      <ReservationPanel
                        print={print}
                        preview={reservationPreview?.printId === print.id ? reservationPreview : null}
                        previewLoading={reservationPreviewLoading}
                        selectedSpoolId={selectedSpoolId}
                        pending={reservationPending || uncertaintyGuard || settlementGuard}
                        error={reservationError}
                        onSelectSpool={(spoolId) => {
                          setSelectedSpoolId(spoolId);
                          setReservationSelectionMode("manual");
                        }}
                        onReserve={() => void confirmReservation(print)}
                        onCancelReservation={() => void releaseReservation(print)}
                        onRefreshPreview={() => void loadReservationPreview(print.id)}
                        onClose={closeReservation}
                        spoolForReservation={reservationPreview?.eligibleSpools.find(
                          (spool) => spool.id === print.reservation?.spoolId,
                        )}
                      />
                    )}

                  {settlementPanelOpen && !isEditing && !isDeleting && renderSettlementPanel(print, settlementWorkflow)}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {detachedSettlementWorkflows.map((workflow) => (
        <article key={workflow.print.id} className="carbon-collection-row">
          <div className="carbon-row-main">
            <p className="carbon-label">Settlement recovery</p>
            <h3 className="carbon-row-title text-lg font-semibold">{describePrint(workflow.print)}</h3>
            {(workflow.receipt ?? workflow.print.settlement) && (
              <p className="carbon-row-secondary text-muted-foreground mt-2 text-sm">
                This print was deleted. Its saved settlement result remains available while this page is open.
              </p>
            )}
          </div>
          {settlementPanelPrintId === workflow.print.id ? (
            renderSettlementPanel(workflow.print, workflow)
          ) : (
            <div className="carbon-row-actions">
              <Button
                id={`review-settlement-${workflow.print.id}`}
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  mutationPending ||
                  refreshing ||
                  uncertaintyGuard ||
                  settlementGuard ||
                  settlementPanelPrintId !== null ||
                  createOpen ||
                  editingPrintId !== null ||
                  deletePrintId !== null
                }
                onClick={() => {
                  openSettlement(workflow.print);
                }}
              >
                Review settlement
              </Button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { CollectionTable, CollectionTableCell, CollectionTableRow } from "@/components/ui/CollectionTable";
import { Button } from "@/components/ui/button";
import { PrintForm, type PrintUpdateCommand } from "@/components/prints/PrintForm";
import { ReservationPanel } from "@/components/prints/ReservationPanel";
import { SettlementPanel } from "@/components/prints/SettlementPanel";
import { readPrintDto } from "@/lib/print-dto";
import { readPrintUpdateDto, type PrintRecalculationDto, type PrintUpdateDto } from "@/lib/print-update-dto";
import type { PrintDto } from "@/lib/prints";
import { MAX_EXPECTED_RESERVATION_GRAMS } from "@/lib/reservation-validation";
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

interface ReleaseCommand {
  readonly printId: string;
  readonly reservationId: string;
  readonly expectedVersion: number;
}

interface PrintRecovery {
  kind: "edit" | "release";
  phase: "uncertain" | "reconciling" | "read_failed";
  editCommand?: PrintUpdateCommand;
  releaseCommand?: ReleaseCommand;
  knownPrint?: PrintDto;
  message: string;
  knownOutcome?: string;
  closeEditAfterRead?: boolean;
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
type PreviewSelection = "manual-retained" | "manual-replaced" | "best-fit" | "none";
type PreviewLoadResult = { ok: true; selection: PreviewSelection } | { ok: false };

export function PrintList({ initialPrints }: PrintListProps) {
  const [prints, setPrints] = useState(() => orderedPrints(initialPrints));
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPrintId, setEditingPrintId] = useState<string | null>(null);
  const [editFormResetVersion, setEditFormResetVersion] = useState(0);
  const [deletePrintId, setDeletePrintId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [listError, setListError] = useState<ListError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uncertaintyGuard, setUncertaintyGuard] = useState(false);
  const [printRecovery, setPrintRecovery] = useState<PrintRecovery | null>(null);
  const [reservationPrintId, setReservationPrintId] = useState<string | null>(null);
  const [reservationPreview, setReservationPreview] = useState<ReservationPreview | null>(null);
  const [selectedSpoolId, setSelectedSpoolId] = useState("");
  const [reservationSelectionMode, setReservationSelectionMode] = useState<"best_fit" | "manual">("best_fit");
  const [reservationPending, setReservationPending] = useState(false);
  const [reservationPreviewLoading, setReservationPreviewLoading] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const [reservationNotice, setReservationNotice] = useState("");
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
  const printRecoveryRef = useRef<PrintRecovery | null>(null);
  const printRecoveryRequestRef = useRef(0);

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

  function updatePrintRecovery(recovery: PrintRecovery | null) {
    printRecoveryRef.current = recovery;
    setPrintRecovery(recovery);
  }

  function describeRecalculation(print: PrintDto, recalculation: PrintRecalculationDto | null): string {
    const summary = describePrint(print);
    if (!recalculation) return `${summary} saved.`;
    if (recalculation.outcome === "insufficient_material") {
      return `${summary} saved without a reservation. No eligible spool has enough available material.`;
    }
    const spool = print.reservation?.spoolId;
    const grams = recalculation.reservationGrams;
    const margin = recalculation.marginPercent;
    if (recalculation.outcome === "manual_retained") {
      return `${summary} saved. The manual spool was retained with ${grams} g held at the current ${margin}% margin.`;
    }
    if (recalculation.outcome === "manual_fallback") {
      return `${summary} saved. The manual spool no longer fit, so reservation ${grams} g moved to best-fit spool ${spool}.`;
    }
    return `${summary} saved. Reservation ${grams} g was assigned to best-fit spool ${spool} at the current ${margin}% margin.`;
  }

  async function reconcilePrintRecovery(recovery: PrintRecovery) {
    const requestId = ++printRecoveryRequestRef.current;
    const currentRecovery = { ...recovery, phase: "reconciling" as const };
    updatePrintRecovery(currentRecovery);
    setUncertaintyGuard(true);
    setListError(null);
    if (currentRecovery.knownPrint) {
      setPrints((previous) =>
        orderedPrints(
          previous.map((print) => (print.id === currentRecovery.knownPrint?.id ? currentRecovery.knownPrint : print)),
        ),
      );
    }
    const [printResult, spoolResult] = await Promise.all([
      readCollection("/api/prints", "prints", readPrintDto, "print list"),
      readCollection("/api/spools", "spools", readSpoolDto, "spool inventory"),
    ]);
    if (printRecoveryRequestRef.current !== requestId) return false;

    if (!printResult.ok) {
      updatePrintRecovery({
        ...currentRecovery,
        phase: "read_failed",
        message: `${printResult.message} ${currentRecovery.knownOutcome ?? "The command remains unresolved."}`,
      });
      setListError({
        kind: printResult.unauthenticated ? "unauthenticated" : "unavailable",
        message: printResult.message,
      });
      return false;
    }
    if (!spoolResult.ok) {
      updatePrintRecovery({
        ...currentRecovery,
        phase: "read_failed",
        message: `${spoolResult.message} ${currentRecovery.knownOutcome ?? "The command remains unresolved."}`,
      });
      setListError({
        kind: spoolResult.unauthenticated ? "unauthenticated" : "unavailable",
        message: spoolResult.message,
      });
      return false;
    }

    setPrints(orderedPrints(printResult.value));
    setListError(null);
    closeReservation();
    if (currentRecovery.closeEditAfterRead) {
      const printId = currentRecovery.editCommand?.printId;
      if (printId && editingPrintId === printId) {
        setEditingPrintId(null);
        focusTarget.current = printResult.value.some((print) => print.id === printId)
          ? `edit-print-${printId}`
          : "add-print-button";
      }
    }
    updatePrintRecovery(null);
    setUncertaintyGuard(false);
    const currentReleasePrint = currentRecovery.releaseCommand
      ? printResult.value.find((print) => print.id === currentRecovery.releaseCommand?.printId)
      : undefined;
    if (currentRecovery.kind === "release" && currentReleasePrint?.reservation) {
      reservationPrintIdRef.current = currentReleasePrint.id;
      setReservationPrintId(currentReleasePrint.id);
      setReservationNotice(
        "Cancellation was not applied because the print changed. The current reservation is shown here; review it before cancelling again.",
      );
      setStatusMessage("");
    } else {
      setStatusMessage(
        currentRecovery.knownOutcome
          ? `${currentRecovery.knownOutcome} Current print and stock are loaded.`
          : "The current print and stock were loaded. Review them before making another change.",
      );
    }
    return true;
  }

  function beginUncertainEdit(command: PrintUpdateCommand) {
    updatePrintRecovery({
      kind: "edit",
      phase: "uncertain",
      editCommand: command,
      message: "The exact edit may have completed. Retry the same versioned command to resolve it safely.",
    });
    setUncertaintyGuard(true);
  }

  async function retryPrintRecoveryReads() {
    const recovery = printRecoveryRef.current;
    if (recovery?.phase !== "read_failed" || mutationPendingRef.current || refreshingRef.current) return;
    await reconcilePrintRecovery(recovery);
  }

  async function retryPrintEdit(command: PrintUpdateCommand) {
    if (mutationPendingRef.current || refreshingRef.current) return;
    updateMutationPending(true);
    let response: Response;
    try {
      response = await fetch(`/api/prints/${command.printId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          name: command.name,
          material: command.material,
          colour: command.colour,
          requiredGrams: command.requiredGrams,
          expectedVersion: String(command.expectedVersion),
        }),
      });
    } catch {
      updateMutationPending(false);
      updatePrintRecovery({
        kind: "edit",
        phase: "uncertain",
        editCommand: command,
        message:
          "The exact edit could not be reached. Retry the same versioned command when the connection is available.",
      });
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    updateMutationPending(false);
    if (response.status === 200 && response.ok) {
      const result = readPrintUpdateDto(body, command.printId, command.expectedVersion);
      if (result) {
        setPrints((previous) =>
          orderedPrints(previous.map((print) => (print.id === result.print.id ? result.print : print))),
        );
        void reconcilePrintRecovery({
          kind: "edit",
          phase: "reconciling",
          editCommand: command,
          message: "The exact edit is confirmed. Reading the current print and stock.",
          knownOutcome: describeRecalculation(result.print, result.recalculation),
          knownPrint: result.print,
          closeEditAfterRead: true,
        });
        return;
      }
    }

    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const code = error?.code;
    if (
      (response.status === 409 && (code === "edit_conflict" || code === "print_settled")) ||
      response.status === 404
    ) {
      const reason =
        response.status === 404
          ? "The print no longer exists."
          : code === "print_settled"
            ? "The print is now settled."
            : "The submitted print version is no longer current.";
      void reconcilePrintRecovery({
        kind: "edit",
        phase: "reconciling",
        editCommand: command,
        closeEditAfterRead: true,
        message: `${reason} The original edit may have completed. Reading current print and stock; the original edit result cannot be recovered.`,
        knownOutcome: `${reason} The original edit may have completed. The original edit result cannot be recovered.`,
      });
      return;
    }

    const detail =
      response.status === 401
        ? "Your session expired before the command could be checked. Sign in, then retry the exact edit."
        : response.status >= 500 || response.ok
          ? "The edit result is still uncertain. Retry the exact same versioned command."
          : "The command could not be validated. Keep it unchanged and retry after resolving the form or session issue.";
    updatePrintRecovery({ kind: "edit", phase: "uncertain", editCommand: command, message: detail });
  }

  function readReleaseReceipt(value: unknown, command: ReleaseCommand) {
    if (
      !isRecord(value) ||
      value.reservationId !== command.reservationId ||
      (value.disposition !== "released" && value.disposition !== "already_released")
    )
      return undefined;
    const print = value.print === null ? null : readPrintDto(value.print);
    const spool = value.spool === null ? null : readSpoolDto(value.spool);
    if ((value.print !== null && !print) || (value.spool !== null && !spool)) return undefined;
    if (print && print.id !== command.printId) return undefined;
    return { disposition: value.disposition, print: print ?? null };
  }

  async function retryPrintRecovery() {
    const recovery = printRecoveryRef.current;
    if (!recovery || recovery.phase === "reconciling" || mutationPendingRef.current || refreshingRef.current) return;
    if (recovery.phase !== "uncertain") {
      await retryPrintRecoveryReads();
      return;
    }
    if (recovery.kind === "edit" && recovery.editCommand) {
      await retryPrintEdit(recovery.editCommand);
      return;
    }
    const command = recovery.releaseCommand;
    if (!command) return;
    updateMutationPending(true);
    let response: Response;
    try {
      response = await fetch(`/api/prints/${command.printId}/reservation/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          reservationId: command.reservationId,
          expectedVersion: String(command.expectedVersion),
        }),
      });
    } catch {
      updateMutationPending(false);
      updatePrintRecovery({
        ...recovery,
        message: "The exact cancellation could not be reached. Retry the same reservation and print version.",
      });
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    updateMutationPending(false);
    const receipt = response.status === 200 && response.ok ? readReleaseReceipt(body, command) : undefined;
    if (receipt) {
      const currentPrint = receipt.print;
      const knownOutcome =
        receipt.print?.reservation && receipt.print.reservation.id !== command.reservationId
          ? "The submitted reservation is terminal; a newer reservation is active."
          : receipt.disposition === "released"
            ? "The reservation release is confirmed."
            : "The reservation was already released.";
      void reconcilePrintRecovery({
        kind: "release",
        phase: "reconciling",
        message: "The exact cancellation is resolved. Reading the current print and stock.",
        knownOutcome,
        knownPrint: currentPrint ?? undefined,
      });
      return;
    }
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const code = error?.code;
    if (
      (response.status === 409 && (code === "edit_conflict" || code === "print_settled")) ||
      response.status === 404
    ) {
      const reason =
        response.status === 404
          ? "The print or reservation is no longer active."
          : "The print changed before cancellation.";
      void reconcilePrintRecovery({
        kind: "release",
        phase: "reconciling",
        releaseCommand: command,
        message: `${reason} Reading current print and stock; the exact cancellation will not be advanced to a newer version.`,
        knownOutcome: `${reason} Review the current reservation before cancelling again.`,
      });
      return;
    }
    updatePrintRecovery({
      ...recovery,
      message:
        response.status === 401
          ? "Your session expired before cancellation could be checked. Sign in, then retry the exact cancellation."
          : response.status >= 500 || response.ok
            ? "The cancellation result is still uncertain. Retry the exact same reservation and print version."
            : "The cancellation command could not be validated. Keep it unchanged and retry after resolving the form or session issue.",
    });
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
    setReservationNotice("");
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
    if (printRecoveryRef.current?.editCommand?.printId === printId) return;
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

  function savePrint(saved: PrintDto | PrintUpdateDto, mode: "create" | "edit") {
    if (mode === "edit") {
      if (!("print" in saved)) return;
      const result = saved;
      setPrints((previous) =>
        orderedPrints(previous.map((print) => (print.id === result.print.id ? result.print : print))),
      );
      const outcome = describeRecalculation(result.print, result.recalculation);
      setStatusMessage(outcome);
      focusTarget.current = `edit-print-${result.print.id}`;
      setEditingPrintId(null);
      return;
    }
    if ("print" in saved) return;
    setPrints((previous) => {
      return orderedPrints([saved, ...previous]);
    });
    setStatusMessage(`${describePrint(saved)} saved.`);
    focusTarget.current = `edit-print-${saved.id}`;
    setCreateOpen(false);
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
    if (printRecoveryRef.current) {
      await retryPrintRecoveryReads();
      return false;
    }
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
    if (options.conflictId) setEditFormResetVersion((version) => version + 1);
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

  async function loadReservationPreview(
    printId: string,
    options: { preserveManualSpoolId?: string } = {},
  ): Promise<PreviewLoadResult> {
    if (reservationPrintIdRef.current !== printId || refreshingRef.current) return { ok: false };
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
      if (!isCurrentPreview()) return { ok: false };
      setReservationError("The preview could not be reached. Try loading it again.");
      setReservationPreviewLoading(false);
      return { ok: false };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (!isCurrentPreview()) return { ok: false };
    if (response.ok && isRecord(body) && Array.isArray(body.eligibleSpools)) {
      const eligibleSpools = body.eligibleSpools.map(readSpoolDto);
      if (
        typeof body.printId === "string" &&
        body.printId === printId &&
        typeof body.expectedVersion === "number" &&
        Number.isSafeInteger(body.expectedVersion) &&
        body.expectedVersion > 0 &&
        typeof body.marginPercent === "number" &&
        Number.isInteger(body.marginPercent) &&
        body.marginPercent >= 0 &&
        body.marginPercent <= 100 &&
        typeof body.reservationGrams === "number" &&
        Number.isSafeInteger(body.reservationGrams) &&
        body.reservationGrams > 0 &&
        body.reservationGrams <= MAX_EXPECTED_RESERVATION_GRAMS &&
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
        const manualSelectionRetained =
          options.preserveManualSpoolId !== undefined &&
          preview.eligibleSpools.some((spool) => spool.id === options.preserveManualSpoolId);
        const selection: PreviewSelection =
          preview.eligibleSpools.length === 0
            ? "none"
            : manualSelectionRetained
              ? "manual-retained"
              : options.preserveManualSpoolId
                ? "manual-replaced"
                : "best-fit";
        setReservationPreview(preview);
        setReservationSelectionMode(manualSelectionRetained ? "manual" : "best_fit");
        setSelectedSpoolId(
          manualSelectionRetained
            ? (options.preserveManualSpoolId ?? "")
            : (preview.suggestedSpoolId ?? (preview.eligibleSpools.length ? preview.eligibleSpools[0].id : "")),
        );
        setReservationPreviewLoading(false);
        return { ok: true, selection };
      }
    }
    if (response.status === 409 && isRecord(body) && isRecord(body.error) && body.error.code === "already_reserved") {
      await refreshList({ conflictId: printId });
      return { ok: false };
    } else {
      setReservationError(
        response.status >= 500
          ? "The preview is temporarily unavailable. Try again."
          : "The preview could not be read. Refresh the print list and try again.",
      );
    }
    setReservationPreview(null);
    setReservationPreviewLoading(false);
    return { ok: false };
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
          expectedReservationGrams: String(preview.reservationGrams),
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
        const result = await loadReservationPreview(print.id);
        if (result.ok) {
          setReservationError("The available selection changed. Review this fresh preview and confirm again.");
        }
      } else if (code === "reservation_amount_stale" || code === "reservation_preview_required") {
        const manualSpoolId =
          reservationSelectionMode === "manual" && reservationPreview?.printId === print.id
            ? selectedSpoolId
            : undefined;
        const result = await loadReservationPreview(print.id, { preserveManualSpoolId: manualSpoolId });
        if (result.ok) {
          const explanation =
            result.selection === "manual-replaced"
              ? " Your chosen spool is no longer eligible, so the suggested best fit is selected."
              : result.selection === "none"
                ? " No matching spool has enough available material."
                : result.selection === "manual-retained"
                  ? " Your chosen spool is still eligible and remains selected."
                  : " The suggested best fit is selected.";
          const recoveryMessage =
            code === "reservation_amount_stale"
              ? "The current account margin changed the reservation amount. Review this fresh preview and confirm again."
              : "A fresh reservation preview is required. Review it and confirm again.";
          setReservationError(recoveryMessage + explanation);
        }
      } else if (code === "insufficient_material") {
        const result = await loadReservationPreview(print.id);
        if (result.ok) {
          setReservationError("No eligible spool has enough available material. The preview has been refreshed.");
        }
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
    const command: ReleaseCommand = Object.freeze({
      printId: print.id,
      reservationId,
      expectedVersion: print.version,
    });
    setReservationPending(true);
    updateMutationPending(true);
    setReservationError("");
    let response: Response;
    try {
      response = await fetch(`/api/prints/${print.id}/reservation/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          reservationId: command.reservationId,
          expectedVersion: String(command.expectedVersion),
        }),
      });
    } catch {
      updatePrintRecovery({
        kind: "release",
        phase: "uncertain",
        releaseCommand: command,
        message: "The cancellation outcome may be uncertain. Retry the exact reservation and print version.",
      });
      setUncertaintyGuard(true);
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
    const receipt = response.status === 200 && response.ok ? readReleaseReceipt(body, command) : undefined;
    setReservationPending(false);
    updateMutationPending(false);
    if (receipt) {
      const currentPrint = receipt.print;
      if (currentPrint) {
        setPrints((previous) =>
          orderedPrints(previous.map((item) => (item.id === currentPrint.id ? currentPrint : item))),
        );
      }
      if (currentPrint?.reservation && currentPrint.reservation.id !== reservationId) {
        setReservationError(
          "The displayed reservation was released, and a newer reservation is now active. The current state has been updated.",
        );
        setReservationPrintId(print.id);
        focusTarget.current = `manage-reservation-${print.id}`;
      } else {
        setStatusMessage(`${print.reservation?.reservedGrams} g released. Recorded stock remains unchanged.`);
        closeReservation();
        focusTarget.current = `reserve-material-${print.id}`;
      }
      setReservationPreview(null);
      return;
    }

    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const code = error?.code;
    if (
      (response.status === 409 && (code === "edit_conflict" || code === "print_settled")) ||
      response.status === 404
    ) {
      const reason =
        response.status === 404
          ? "The print or reservation is no longer active."
          : "The print changed before cancellation.";
      void reconcilePrintRecovery({
        kind: "release",
        phase: "reconciling",
        releaseCommand: command,
        message: `${reason} Reading current print and stock; cancellation will not be advanced to a newer version.`,
        knownOutcome: `${reason} Review the current reservation before cancelling again.`,
      });
      return;
    }

    updatePrintRecovery({
      kind: "release",
      phase: "uncertain",
      releaseCommand: command,
      message:
        response.status === 401
          ? "Your session expired before cancellation could be checked. Sign in, then retry the exact cancellation."
          : response.status >= 500 || response.ok
            ? "The cancellation result is uncertain. Retry the exact same reservation and print version."
            : "The cancellation command could not be validated. Keep it unchanged and retry after resolving the session or validation issue.",
    });
    setUncertaintyGuard(true);
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
            disabled={mutationPending || refreshing || uncertaintyGuard}
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
            {printRecovery?.message ??
              "A previous change may have completed without confirmation. Review the current saved list before repeating any action."}
          </p>
          <div className="carbon-feedback-actions">
            <Button
              type="button"
              variant="outline"
              className="whitespace-normal"
              onClick={() => {
                if (printRecovery) void retryPrintRecovery();
                else void refreshList();
              }}
              disabled={mutationPending || refreshing || printRecovery?.phase === "reconciling"}
            >
              {printRecovery?.phase === "reconciling"
                ? "Reading current print and stock…"
                : printRecovery?.phase === "read_failed"
                  ? "Retry current print and stock reads"
                  : printRecovery?.kind === "edit"
                    ? "Retry exact edit"
                    : printRecovery?.kind === "release"
                      ? "Retry exact cancellation"
                      : refreshing
                        ? "Refreshing…"
                        : "Refresh and review prints"}
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
            onUncertain={(command) => {
              if (command) beginUncertainEdit(command);
              else handleUncertainMutation();
            }}
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
        <CollectionTable
          label="Print queue"
          actionColumn="standard"
          columns={[
            { label: "Print" },
            { label: "Material" },
            { label: "Required" },
            { label: "Reserved", ariaLabel: "Reservation / result" },
            { label: "Actions" },
          ]}
        >
          {prints.map((print) => {
            const isEditing = editingPrintId === print.id;
            const isDeleting = deletePrintId === print.id;
            const settlementWorkflow = settlementWorkflows[print.id];
            const settlementPanelOpen = settlementPanelPrintId === print.id;
            const actionsDisabled =
              mutationPending || refreshing || uncertaintyGuard || settlementGuard || settlementPanelPrintId !== null;
            const summary = describePrint(print);
            return (
              <CollectionTableRow key={print.id} labelledBy={`print-title-${print.id}`}>
                <CollectionTableCell label="Print" mobileFullWidth className="carbon-row-main">
                  {print.settlement && <p className="carbon-label">Completed print</p>}
                  <h3 id={`print-title-${print.id}`} className="carbon-row-title mt-1 text-lg font-semibold">
                    {summary}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-xs break-all">
                    Print{" "}
                    <code className="font-mono" title={print.id}>
                      <span aria-hidden="true">{shortId(print.id)}…</span>
                      <span className="sr-only">{print.id}</span>
                    </code>
                  </p>
                </CollectionTableCell>

                <CollectionTableCell label="Material / colour" className="carbon-print-table-cell-material">
                  <p className="carbon-row-secondary text-sm">
                    {print.material} · {print.colour}
                  </p>
                </CollectionTableCell>

                <CollectionTableCell label="Required estimate" className="carbon-print-table-cell-required">
                  <p className="carbon-value text-lg">{print.requiredGrams} g</p>
                </CollectionTableCell>

                <CollectionTableCell
                  label="Reservation / result"
                  mobileFullWidth
                  className="carbon-print-table-cell-result"
                >
                  {print.reservation ? (
                    <p className="carbon-value text-lg">
                      {print.reservation.reservedGrams} g<span className="sr-only"> reserved</span>
                    </p>
                  ) : print.settlement ? (
                    <>
                      <p className="carbon-label">Actual consumption</p>
                      <p className="carbon-value text-lg">{print.settlement.actualGrams} g consumed</p>
                    </>
                  ) : (
                    <p className="carbon-row-secondary text-sm">No active reservation</p>
                  )}
                </CollectionTableCell>

                {!isEditing && !isDeleting && (
                  <CollectionTableCell label="Actions" mobileFullWidth className="carbon-print-table-cell-actions">
                    <div className="carbon-row-actions carbon-data-table-actions">
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
                          <span>Review</span>
                          <span className="sr-only"> settlement</span>
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
                              <span>Settle</span>
                              <span className="sr-only"> print</span>
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
                            {print.reservation ? (
                              <>
                                <span>Manage</span>
                                <span className="sr-only"> reservation</span>
                              </>
                            ) : (
                              <>
                                <span>Reserve</span>
                                <span className="sr-only"> material</span>
                              </>
                            )}
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
                  </CollectionTableCell>
                )}

                {isEditing && (
                  <CollectionTableCell
                    mobileFullWidth
                    ariaColSpan={5}
                    className="carbon-inline-panel carbon-row-inline-panel carbon-data-table-panel"
                  >
                    <h4 className="mb-4 text-base font-semibold">Edit planned print</h4>
                    <PrintForm
                      key={`${print.id}-${editFormResetVersion}`}
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
                      onUncertain={(command) => {
                        if (command) beginUncertainEdit(command);
                        else handleUncertainMutation();
                      }}
                      onRefreshLatest={() => refreshList({ conflictId: print.id })}
                    />
                  </CollectionTableCell>
                )}

                {isDeleting && (
                  <CollectionTableCell
                    mobileFullWidth
                    ariaColSpan={5}
                    className="carbon-inline-panel carbon-inline-panel-warning carbon-row-inline-panel carbon-data-table-panel"
                    ariaLabelledBy={`delete-confirmation-${print.id}`}
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
                  </CollectionTableCell>
                )}

                {reservationPrintId === print.id &&
                  !isEditing &&
                  !isDeleting &&
                  !print.settlement &&
                  !settlementPanelOpen && (
                    <CollectionTableCell mobileFullWidth ariaColSpan={5} className="carbon-data-table-panel">
                      <ReservationPanel
                        print={print}
                        preview={reservationPreview?.printId === print.id ? reservationPreview : null}
                        previewLoading={reservationPreviewLoading}
                        selectedSpoolId={selectedSpoolId}
                        pending={reservationPending || uncertaintyGuard || settlementGuard}
                        error={reservationError}
                        notice={reservationNotice}
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
                    </CollectionTableCell>
                  )}

                {settlementPanelOpen && !isEditing && !isDeleting && (
                  <CollectionTableCell mobileFullWidth ariaColSpan={5} className="carbon-data-table-panel">
                    {renderSettlementPanel(print, settlementWorkflow)}
                  </CollectionTableCell>
                )}
              </CollectionTableRow>
            );
          })}
        </CollectionTable>
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

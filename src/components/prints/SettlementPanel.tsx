import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import type { PrintDto } from "@/lib/prints";
import type { SettlementReceipt } from "@/lib/settlement-dto";
import type { SpoolDto } from "@/lib/spools";

type SettlementPanelState = "editing" | "pending" | "uncertain" | "rejected" | "loading" | "receipt";

interface SettlementPanelProps {
  inWorkbench?: boolean;
  print: PrintDto;
  printAvailable: boolean;
  state: SettlementPanelState;
  draftText: string;
  receipt: SettlementReceipt | null;
  reservedSpool: SpoolDto | null;
  currentSpool: SpoolDto | null;
  currentSpoolDeleted: boolean;
  error: string;
  fieldError: string;
  signInRequired: boolean;
  settlementBlocked: boolean;
  reconciliationPending: boolean;
  canConfirm: boolean;
  canReplay: boolean;
  canCheckStatus: boolean;
  canRetryReconciliation: boolean;
  attemptNote: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onReplay: () => void;
  onCheckStatus: () => void;
  onRetryReconciliation: () => void;
  onClose: () => void;
}

function describePrint(print: PrintDto) {
  return print.name ?? `${print.material}, ${print.colour}, ${print.requiredGrams} g`;
}

function receiptPrintName(receipt: SettlementReceipt) {
  return receipt.print.name ?? `${receipt.print.material}, ${receipt.print.colour}, ${receipt.print.requiredGrams} g`;
}

export function SettlementPanel({
  inWorkbench = false,
  print,
  printAvailable,
  state,
  draftText,
  receipt,
  reservedSpool,
  currentSpool,
  currentSpoolDeleted,
  error,
  fieldError,
  signInRequired,
  settlementBlocked,
  reconciliationPending,
  canConfirm,
  canReplay,
  canCheckStatus,
  canRetryReconciliation,
  attemptNote,
  onDraftChange,
  onConfirm,
  onReplay,
  onCheckStatus,
  onRetryReconciliation,
  onClose,
}: SettlementPanelProps) {
  const completed = Boolean(receipt ?? print.settlement);
  const printName = receipt ? receiptPrintName(receipt) : describePrint(print);
  const Panel = inWorkbench ? "div" : "section";

  return (
    <Panel
      aria-labelledby={inWorkbench ? undefined : `settlement-heading-${print.id}`}
      className={inWorkbench ? "min-w-0" : "carbon-inline-panel carbon-row-inline-panel"}
    >
      {!inWorkbench && (
        <h4 id={`settlement-heading-${print.id}`} className="font-semibold" tabIndex={-1}>
          {receipt ? "Settlement result" : completed ? "Review settlement" : "Settle completed print"}
        </h4>
      )}
      <p className="mt-2 text-sm leading-relaxed">
        {printName}
        {receipt ? ` — settled ${new Date(receipt.settledAt).toLocaleString()}.` : "."}
      </p>

      {!completed && !printAvailable && (
        <p role="status" className="carbon-feedback mt-3">
          This print is no longer in the current collection. No new settlement can be submitted.
        </p>
      )}

      {!completed && printAvailable && print.reservation && (
        <div className="carbon-feedback mt-3">
          <p>
            Settlement records actual consumption once and releases this exact {print.reservation.reservedGrams} g
            reservation. Enter the amount used; 0 g still completes the print. If recorded stock cannot cover later
            reservations on this spool, the newest reservations are cancelled first.
          </p>
          <dl className="mt-3 grid min-w-0 gap-2">
            <div className="min-w-0">
              <dt className="carbon-label">Reserved spool</dt>
              <dd className="mt-1 break-words">
                {reservedSpool
                  ? `${reservedSpool.material}, ${reservedSpool.colour}`
                  : "Current spool details unavailable"}
              </dd>
              <dd className="text-muted-foreground mt-1 text-xs break-all">
                Spool <code>{print.reservation.spoolId}</code>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="carbon-label">Exact reservation</dt>
              <dd className="mt-1 break-all">
                <code>{print.reservation.id}</code> <span>({print.reservation.reservedGrams} g)</span>
              </dd>
            </div>
          </dl>
        </div>
      )}

      {state === "loading" && !receipt && (
        <p role="status" aria-live="polite" className="mt-3 text-sm">
          Reading the saved settlement result…
        </p>
      )}

      {!completed && printAvailable && print.reservation && (
        <form
          className="carbon-collection-form mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
          noValidate
        >
          <FormField
            id={`settlement-actual-grams-${print.id}`}
            name="actualGrams"
            label="Actual consumption (g)"
            value={draftText}
            onChange={onDraftChange}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            autoComplete="off"
            required
            disabled={state === "pending" || state === "uncertain" || settlementBlocked}
            hint="Enter whole grams using digits only, from 0 to 2,147,483,647. The actual amount may exceed recorded stock."
            error={fieldError || undefined}
          />
          {state === "rejected" && (
            <p role="status" className="text-sm">
              This attempt was not applied. Review the current reservation, then change or re-enter the amount to start
              a new attempt.
            </p>
          )}
          <div className="carbon-form-actions">
            <Button type="submit" disabled={!canConfirm}>
              {state === "pending" ? "Settling…" : "Confirm settlement"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={state === "pending"}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {state === "uncertain" && !receipt && (
        <div role="status" aria-live="polite" className="carbon-feedback carbon-feedback-warning mt-3">
          <p>
            Settlement may have completed. Keep this amount unchanged until the saved result is read or this same
            attempt is retried.
          </p>
          <div className="carbon-feedback-actions">
            {canCheckStatus && (
              <Button type="button" variant="outline" onClick={onCheckStatus}>
                Check saved result
              </Button>
            )}
            {canReplay && (
              <Button type="button" onClick={onReplay}>
                Retry the same settlement
              </Button>
            )}
          </div>
        </div>
      )}

      {receipt && (
        <div className="mt-4 space-y-3">
          <p role="status" aria-live="polite" className="carbon-feedback">
            {attemptNote.length > 0
              ? attemptNote
              : "Saved settlement result. Actual consumption is recorded once for this print."}
          </p>
          {receipt.exceededEstimate && (
            <div role="status" className="carbon-feedback carbon-feedback-warning">
              <p>
                The entered estimate exceeded recorded stock. The recorded estimate is now 0 g; this does not establish
                how much filament remains physically.
              </p>
            </div>
          )}

          <dl className="carbon-row-values">
            <div className="carbon-row-value">
              <dt className="carbon-label">Actual consumption</dt>
              <dd className="carbon-value mt-1 text-lg">{receipt.actualGrams} g</dd>
            </div>
            <div className="carbon-row-value">
              <dt className="carbon-label">Reservation released</dt>
              <dd className="mt-1 text-sm break-words">
                {receipt.releasedGrams} g from <code className="break-all">{receipt.reservationId}</code>
              </dd>
            </div>
            <div className="carbon-row-value">
              <dt className="carbon-label">Completed print</dt>
              <dd className="mt-1 text-sm break-words">{printName}</dd>
            </div>
          </dl>

          <section aria-labelledby={`settlement-history-heading-${print.id}`} className="carbon-feedback">
            <h5 id={`settlement-history-heading-${print.id}`} className="font-semibold">
              Stock recorded at settlement
            </h5>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              These historical quantities were saved with the result and may differ from current stock.
            </p>
            <dl className="carbon-row-values mt-3">
              <div className="carbon-row-value">
                <dt className="carbon-label">Recorded</dt>
                <dd className="carbon-value mt-1">
                  {receipt.spool.recordedGramsBefore} g → {receipt.spool.recordedGramsAfter} g
                </dd>
              </div>
              <div className="carbon-row-value">
                <dt className="carbon-label">Reserved after</dt>
                <dd className="carbon-value mt-1">{receipt.spool.reservedGramsAfter} g</dd>
              </div>
              <div className="carbon-row-value">
                <dt className="carbon-label">Available after</dt>
                <dd className="carbon-value mt-1">{receipt.spool.availableGramsAfter} g</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby={`settlement-cancellations-heading-${print.id}`} className="carbon-feedback">
            <h5 id={`settlement-cancellations-heading-${print.id}`} className="font-semibold">
              Newer reservations cancelled ({receipt.cancelledReservations.length})
            </h5>
            {receipt.cancelledReservations.length ? (
              <ol className="mt-2 list-decimal space-y-2 ps-5">
                {receipt.cancelledReservations.map((cancelled, index) => (
                  <li key={cancelled.reservationId} className="break-words">
                    <span className="font-medium">
                      {index + 1}. {cancelled.printName ?? `${cancelled.material}, ${cancelled.colour}`}
                    </span>
                    <dl className="text-muted-foreground mt-1 space-y-1 text-xs">
                      <div>
                        <dt className="inline">Print: </dt>
                        <dd className="inline break-all">
                          <code>{cancelled.printId}</code>
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Reservation: </dt>
                        <dd className="inline break-all">
                          <code>{cancelled.reservationId}</code>
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-1 text-sm">{cancelled.releasedGrams} g released</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">No other reservations were cancelled.</p>
            )}
          </section>

          <section aria-labelledby={`settlement-current-heading-${print.id}`} className="carbon-feedback">
            <h5 id={`settlement-current-heading-${print.id}`} className="font-semibold">
              Current spool stock
            </h5>
            {reconciliationPending ? (
              <p role="status" aria-live="polite" className="text-muted-foreground mt-2 text-sm">
                Reading the current print and spool collections…
              </p>
            ) : currentSpool ? (
              <>
                <p className="text-muted-foreground mt-1 text-xs">
                  Latest values for {currentSpool.material}, {currentSpool.colour} from one current spool record.
                </p>
                <dl className="carbon-row-values mt-3">
                  <div className="carbon-row-value">
                    <dt className="carbon-label">Recorded</dt>
                    <dd className="carbon-value mt-1">{currentSpool.recordedGrams} g</dd>
                  </div>
                  <div className="carbon-row-value">
                    <dt className="carbon-label">Reserved</dt>
                    <dd className="carbon-value mt-1">{currentSpool.reservedGrams} g</dd>
                  </div>
                  <div className="carbon-row-value">
                    <dt className="carbon-label">Available</dt>
                    <dd className="carbon-value mt-1">{currentSpool.availableGrams} g</dd>
                  </div>
                </dl>
              </>
            ) : currentSpoolDeleted ? (
              <p className="mt-2 text-sm">
                This spool is no longer in the current inventory. Its historical quantities remain above; current stock
                is unavailable.
              </p>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">Current stock has not been reconciled yet.</p>
            )}
          </section>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className={`carbon-feedback ${state === "uncertain" ? "carbon-feedback-warning" : "carbon-feedback-error"} mt-3`}
        >
          <p>{error}</p>
          {signInRequired && (
            <a className="carbon-feedback-link" href="/auth/signin">
              Sign in
            </a>
          )}
          {canCheckStatus && state !== "uncertain" && (
            <div className="carbon-feedback-actions">
              <Button type="button" variant="outline" onClick={onCheckStatus}>
                Try reading the saved result
              </Button>
            </div>
          )}
        </div>
      )}

      {receipt && settlementBlocked && (
        <p role="status" aria-live="polite" className="text-muted-foreground mt-3 text-sm">
          Current collection reads must succeed before another print change is allowed.
        </p>
      )}

      <div className="carbon-form-actions mt-4">
        {receipt && !reconciliationPending && canRetryReconciliation && (
          <Button type="button" variant="outline" onClick={onRetryReconciliation}>
            Refresh current stock review
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={state === "pending"}>
          Close
        </Button>
      </div>
    </Panel>
  );
}

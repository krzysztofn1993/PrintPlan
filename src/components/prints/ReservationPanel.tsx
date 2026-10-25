import { Button } from "@/components/ui/button";
import type { PrintDto } from "@/lib/prints";
import type { ReservationPreview } from "@/lib/reservations";
import type { SpoolDto } from "@/lib/spools";

interface ReservationPanelProps {
  print: PrintDto;
  preview: ReservationPreview | null;
  previewLoading: boolean;
  selectedSpoolId: string;
  pending: boolean;
  error: string;
  notice: string;
  onSelectSpool: (spoolId: string) => void;
  onReserve: () => void;
  onCancelReservation: () => void;
  onRefreshPreview: () => void;
  onClose: () => void;
  spoolForReservation: SpoolDto | undefined;
}

function describeSpool(spool: SpoolDto) {
  return `${spool.material}, ${spool.colour} — ${spool.availableGrams} g available`;
}

function shortSpoolIds(spools: SpoolDto[]): Map<string, string> {
  const ids = spools.map((spool) => spool.id.replaceAll("-", "").toLowerCase());
  return new Map(
    spools.map((spool, index) => {
      let length = 8;
      while (
        length < ids[index].length &&
        ids.some(
          (candidate, candidateIndex) =>
            candidateIndex !== index && candidate.slice(0, length) === ids[index].slice(0, length),
        )
      ) {
        length += 1;
      }
      return [spool.id, ids[index].slice(0, length)] as const;
    }),
  );
}

export function ReservationPanel({
  print,
  preview,
  previewLoading,
  selectedSpoolId,
  pending,
  error,
  notice,
  onSelectSpool,
  onReserve,
  onCancelReservation,
  onRefreshPreview,
  onClose,
  spoolForReservation,
}: ReservationPanelProps) {
  const shortIds = preview ? shortSpoolIds(preview.eligibleSpools) : new Map<string, string>();

  if (print.reservation) {
    return (
      <section
        aria-labelledby={`reservation-heading-${print.id}`}
        className="carbon-inline-panel carbon-row-inline-panel"
      >
        <h4 id={`reservation-heading-${print.id}`} className="font-semibold">
          Material reserved
        </h4>
        <p className="mt-2 text-sm leading-relaxed">
          {print.reservation.reservedGrams} g reserved from{" "}
          {spoolForReservation
            ? `${spoolForReservation.material}, ${spoolForReservation.colour}`
            : `spool ${print.reservation.spoolId}`}
          . Reserved material is held for this print and is not consumed.
        </p>
        <p className="text-muted-foreground mt-1 text-xs break-all">
          Reservation <code>{print.reservation.id}</code>
        </p>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Releasing changes availability only; it does not change recorded stock or record material used. To record
          material consumed outside settlement, correct stock in{" "}
          <a className="carbon-feedback-link" href="/dashboard/spools">
            Filament stock
          </a>
          . A correction cannot reduce recorded stock below active reservations. If this print changed, review its
          current details and stock before releasing it.
        </p>
        {notice && (
          <div role="status" aria-live="polite" className="carbon-feedback carbon-feedback-warning mt-3">
            {notice}
          </div>
        )}
        {error && (
          <p role="alert" className="carbon-feedback carbon-feedback-error mt-3">
            {error}
          </p>
        )}
        <div className="carbon-form-actions mt-4">
          <Button type="button" variant="destructive" onClick={onCancelReservation} disabled={pending}>
            {pending ? "Releasing…" : "Release reservation"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Close
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`reservation-heading-${print.id}`}
      className="carbon-inline-panel carbon-row-inline-panel"
    >
      <h4 id={`reservation-heading-${print.id}`} className="font-semibold">
        Reserve material
      </h4>
      {previewLoading ? (
        <p role="status" className="mt-2 text-sm">
          Loading current stock and safety margin…
        </p>
      ) : null}
      {preview && (
        <>
          <p className="mt-2 text-sm leading-relaxed">
            This preview uses the current {preview.marginPercent}% safety margin to estimate{" "}
            <strong>{preview.reservationGrams} g</strong> from the {print.requiredGrams} g you entered. Best fit
            compares eligible spools using your entered grams and the reservation amount after the margin. Manual
            choices follow the same eligibility and current-margin rules. Confirmation checks the current account margin
            again; if it changes the amount, review a fresh preview and confirm again. Held grams are not consumed.
            Change the margin in{" "}
            <a className="carbon-feedback-link" href="/dashboard/settings">
              Settings
            </a>
            .
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Choices include only spools with matching material and colour and at least {preview.reservationGrams} g
            available. Other matching spools may be omitted if their available stock is too low. The ID identifies a
            stock record, not a physical spool.
          </p>
          {preview.eligibleSpools.length === 0 ? (
            <div role="status" className="carbon-feedback carbon-feedback-warning mt-3">
              <p>No matching spool has enough available material. Recorded stock is unchanged.</p>
            </div>
          ) : (
            <fieldset className="mt-4 min-w-0 space-y-2" disabled={pending}>
              <legend className="text-sm font-medium">Choose a spool</legend>
              {preview.eligibleSpools.map((spool) => {
                const suggested = spool.id === preview.suggestedSpoolId;
                const shortId = shortIds.get(spool.id) ?? spool.id.slice(0, 8);
                return (
                  <label key={spool.id} className="flex min-w-0 items-start gap-3 rounded-md border p-3 text-sm">
                    <input
                      type="radio"
                      name={`reservation-spool-${print.id}`}
                      value={spool.id}
                      checked={selectedSpoolId === spool.id}
                      onChange={() => {
                        onSelectSpool(spool.id);
                      }}
                      className="accent-primary mt-1 size-4 shrink-0"
                    />
                    <span className="min-w-0 break-words">
                      {describeSpool(spool)}
                      {suggested ? <strong> — suggested best fit</strong> : null}
                      <span className="text-muted-foreground mt-1 block text-xs">
                        Spool{" "}
                        <code title={`Full spool ID: ${spool.id}`}>
                          <span aria-hidden="true">{shortId}…</span>
                          <span className="sr-only">Full spool ID {spool.id}</span>
                        </code>
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="carbon-feedback carbon-feedback-error mt-3">
          <p>{error}</p>
        </div>
      )}
      <div className="carbon-form-actions mt-4">
        {preview?.eligibleSpools.length ? (
          <Button
            id={`confirm-reservation-${print.id}`}
            type="button"
            onClick={onReserve}
            disabled={pending || previewLoading || !selectedSpoolId}
          >
            {pending ? "Reserving…" : "Confirm reservation"}
          </Button>
        ) : null}
        {!previewLoading && (!preview || preview.eligibleSpools.length === 0) ? (
          <Button type="button" variant="outline" onClick={onRefreshPreview} disabled={pending}>
            {preview ? "Refresh preview" : "Load preview"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Close
        </Button>
      </div>
    </section>
  );
}

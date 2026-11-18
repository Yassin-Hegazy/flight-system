'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import {
  type Cabin,
  CABIN_LABEL,
  cancelFlight,
  changeStatus,
  NEXT_STATUSES,
  setCapacity,
  setFare,
  utcInstant,
} from '@/lib/admin-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { type Flight, type FlightStatus, STATUS_LABEL } from '@/lib/flights-api';
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/format';
import type { Money } from '@/lib/search-api';
import {
  ADMIN_CARD,
  CardHeading,
  DANGER_BUTTON,
  NAVY_BUTTON,
  PINK_BUTTON,
  QUIET_BUTTON,
} from '../../admin-parts';

/** Everything on the flight page that a write can change. */
function useRefresh(flightId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all(
      ['admin-flight', 'admin-load', 'admin-manifest'].map((key) =>
        client.invalidateQueries({ queryKey: [key, flightId] }),
      ),
    ).then(() => client.invalidateQueries({ queryKey: ['admin-flights'] }));
}

/** One cabin's seats and adult fare (US-AD-03). Existing bookings keep the fare they paid. */
export function CabinForm({
  flightId,
  cabin,
  capacity,
  fare,
}: {
  flightId: string;
  cabin: Cabin;
  capacity?: number;
  fare?: Money;
}) {
  const refresh = useRefresh(flightId);
  const currency = fare?.currency ?? 'EGP';
  const seats = useMutation({
    mutationFn: (value: number) => setCapacity(flightId, cabin, value),
    onSuccess: refresh,
  });
  const [fareError, setFareError] = useState<string | null>(null);
  const price = useMutation({
    mutationFn: (amountMinor: number) => setFare(flightId, cabin, { amountMinor, currency }),
    onSuccess: refresh,
  });
  const label = CABIN_LABEL[cabin];
  const id = cabin.toLowerCase();

  const saveSeats = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    seats.mutate(Number(formText(new FormData(event.currentTarget), 'capacity')));
  };
  const saveFare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = toMinorUnits(formText(new FormData(event.currentTarget), 'fare'), currency);
    setFareError(amount === undefined ? 'Enter an amount such as 15000 or 15000.50.' : null);
    if (amount !== undefined) price.mutate(amount);
  };

  return (
    <section aria-label={`${label} cabin`} className={ADMIN_CARD}>
      <CardHeading kicker="Seats and fare" title={`${label} cabin`} />
      <form onSubmit={saveSeats} noValidate className="flex flex-wrap items-end gap-3">
        <Field
          id={`${id}-seats`}
          label="Seats"
          error={fieldErrorsOf(seats.error).capacity}
          className="min-w-[160px] flex-1"
        >
          {(control) => (
            <input
              {...control}
              key={capacity}
              name="capacity"
              type="number"
              min={0}
              defaultValue={capacity}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <button type="submit" disabled={seats.isPending} className={NAVY_BUTTON}>
          Save seats
        </button>
      </form>
      <FormAlert
        message={
          seats.isError && !fieldErrorsOf(seats.error).capacity ? errorMessage(seats.error) : null
        }
      />
      <form onSubmit={saveFare} noValidate className="flex flex-wrap items-end gap-3">
        <Field
          id={`${id}-fare`}
          label={`Adult fare (${currency})`}
          error={fareError ?? undefined}
          className="min-w-[160px] flex-1"
        >
          {(control) => (
            <input
              {...control}
              key={fare?.amountMinor}
              name="fare"
              inputMode="decimal"
              defaultValue={fare ? fromMinorUnits(String(fare.amountMinor), currency) : ''}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <button type="submit" disabled={price.isPending} className={NAVY_BUTTON}>
          Save fare
        </button>
      </form>
      <FormAlert message={price.isError ? errorMessage(price.error) : null} />
      {price.isSuccess && (
        <p role="status" className="text-sm font-bold">
          Fare saved: {formatMoney({ amountMinor: price.variables, currency })}
        </p>
      )}
    </section>
  );
}

/** Moves the flight along its status table (US-AD-02). A delay carries the new departure. */
export function StatusForm({ flight }: { flight: Flight }) {
  const refresh = useRefresh(flight.id);
  const options = NEXT_STATUSES[flight.status];
  const [next, setNext] = useState<FlightStatus>(options[0]);
  const update = useMutation({
    mutationFn: ({ status, at }: { status: FlightStatus; at?: string }) =>
      changeStatus(flight.id, status, at),
    onSuccess: refresh,
  });
  const errors = fieldErrorsOf(update.error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const at = next === 'DELAYED' ? utcInstant(formText(data, 'estimated')) : undefined;
    update.mutate({ status: next, at: at || undefined });
  };

  return (
    <form
      key={flight.status}
      onSubmit={submit}
      noValidate
      aria-labelledby="status-title"
      className={ADMIN_CARD}
    >
      <CardHeading kicker="Operations" title="Change the status" id="status-title" />
      <p className="-mt-2 text-sm text-navy-soft">
        Now {STATUS_LABEL[flight.status].toLowerCase()}. A delay tells every traveler on board.
      </p>
      <Field id="next-status" label="New status" error={errors.status}>
        {(control) => (
          <select
            {...control}
            value={next}
            onChange={(event) => setNext(event.target.value as FlightStatus)}
            className={INPUT_CLASS}
          >
            {options.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {next === 'DELAYED' && (
        <Field id="estimated" label="New departure (UTC)" error={errors.estimatedDepartureUtc}>
          {(control) => (
            <input {...control} name="estimated" type="datetime-local" className={INPUT_CLASS} />
          )}
        </Field>
      )}
      <FormAlert
        message={
          update.isError && !errors.status && !errors.estimatedDepartureUtc
            ? errorMessage(update.error)
            : null
        }
      />
      <div>
        <button type="submit" disabled={update.isPending} className={PINK_BUTTON}>
          Update status
        </button>
      </div>
    </form>
  );
}

/** Cancels the flight with a reason, after a second, explicit yes (US-AD-04). */
export function CancelForm({ flight }: { flight: Flight }) {
  const refresh = useRefresh(flight.id);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelFlight(flight.id, reason.trim()),
    onSuccess: refresh,
  });
  const errors = fieldErrorsOf(cancel.error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirming) cancel.mutate();
    else setConfirming(true);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="cancel-title"
      className="flex flex-col gap-5 rounded-[22px] bg-blush p-5 sm:p-6"
    >
      <CardHeading kicker="Cannot be undone" title="Cancel the flight" id="cancel-title" />
      <p className="-mt-2 text-sm">
        Every booking on it is cancelled and refunded, and travelers are told why.
      </p>
      <Field id="cancel-reason" label="Reason for cancelling" error={errors.reason}>
        {(control) => (
          <textarea
            {...control}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setConfirming(false);
            }}
            maxLength={255}
            rows={2}
            className={`${INPUT_CLASS} h-auto py-2`}
          />
        )}
      </Field>
      <FormAlert message={cancel.isError && !errors.reason ? errorMessage(cancel.error) : null} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold">Cancel {flight.flightNumber} for every traveler?</p>
          <button type="submit" disabled={cancel.isPending} className={DANGER_BUTTON}>
            Yes, cancel {flight.flightNumber}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={QUIET_BUTTON}>
            Keep it
          </button>
        </div>
      ) : (
        <div>
          <button type="submit" disabled={!reason.trim()} className={DANGER_BUTTON}>
            Cancel this flight
          </button>
        </div>
      )}
    </form>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { addTraveler, removeTraveler, updateTraveler } from '@/lib/account-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { listSavedTravelers, type SavedTraveler } from '@/lib/booking-api';

const KEY = ['saved-travelers'];
const QUIET =
  'h-11 cursor-pointer rounded-full border border-navy/25 px-5 text-xs font-bold hover:border-navy';

/** "Omar Hassan" → ["Omar", "Hassan"]: the API keeps one name, first name then last. */
function split(name: string): [string, string] {
  const space = name.indexOf(' ');
  return space < 0 ? [name, ''] : [name.slice(0, space), name.slice(space + 1)];
}

/** Saved travelers: list, add, edit and remove (US-USR-06). */
export function TravelersView() {
  const travelers = useQuery({ queryKey: KEY, queryFn: listSavedTravelers, retry: false });
  const [editing, setEditing] = useState<SavedTraveler | null>(null);

  if (travelers.isPending) return <p role="status">Loading your travelers…</p>;
  if (travelers.isError) return <FormAlert message={errorMessage(travelers.error)} />;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section
        aria-label="Your saved travelers"
        className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 sm:p-7"
      >
        <p className="text-[11px] leading-none font-bold text-navy-soft">
          SAVED TRAVELERS / {travelers.data.length} OF 10
        </p>
        {travelers.data.length === 0 ? (
          <p className="text-base font-bold">No saved travelers yet.</p>
        ) : (
          <ul aria-label="Saved travelers" className="flex flex-col gap-3">
            {travelers.data.map((traveler) => (
              <Row key={traveler.id} traveler={traveler} onEdit={() => setEditing(traveler)} />
            ))}
          </ul>
        )}
        <p className="rounded-inset bg-teal p-4 text-sm font-medium text-navy-soft">
          A saved traveler fills in passenger details when you book. Editing one never changes an
          existing booking.
        </p>
      </section>
      <TravelerForm key={editing?.id ?? 'new'} editing={editing} onDone={() => setEditing(null)} />
    </div>
  );
}

function Row({ traveler, onEdit }: { traveler: SavedTraveler; onEdit: () => void }) {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const remove = useMutation({
    mutationFn: () => removeTraveler(traveler.id),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
  const initials = split(traveler.name)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <li className="flex flex-col gap-3 rounded-inset border border-line bg-white p-4">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-[52px] shrink-0 place-items-center rounded-inset bg-navy text-base font-extrabold text-white"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold">{traveler.name}</p>
          <p className="text-xs font-bold text-navy-soft">DATE OF BIRTH {traveler.dateOfBirth}</p>
        </div>
      </div>
      <FormAlert message={remove.isError ? errorMessage(remove.error) : null} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        {asking ? (
          <>
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="h-11 cursor-pointer rounded-full bg-danger px-5 text-xs font-bold text-white disabled:opacity-60"
            >
              Yes, remove {traveler.name}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={QUIET}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${traveler.name}`}
              className={QUIET}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setAsking(true)}
              aria-label={`Remove ${traveler.name}`}
              className={QUIET}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function TravelerForm({ editing, onDone }: { editing: SavedTraveler | null; onDone: () => void }) {
  const client = useQueryClient();
  const [first, last] = editing ? split(editing.name) : ['', ''];
  const save = useMutation({
    mutationFn: (input: { name: string; dateOfBirth: string }) =>
      editing ? updateTraveler(editing.id, input) : addTraveler(input),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
  const errors = fieldErrorsOf(save.error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name =
      `${formText(data, 'firstName').trim()} ${formText(data, 'lastName').trim()}`.trim();
    save.mutate(
      { name, dateOfBirth: formText(data, 'dateOfBirth') },
      {
        onSuccess: () => {
          form.reset();
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={editing ? 'Edit traveler' : 'Add a traveler'}
      className="flex flex-col gap-5 rounded-card bg-navy p-5 text-white sm:p-7"
    >
      <div>
        <p className="mt-6 text-[11px] leading-none font-bold text-mist">
          {editing ? 'EDIT TRAVELER' : 'NEW TRAVELER'}
        </p>
        <h2 className="mt-3 text-2xl leading-tight font-extrabold">
          {editing ? `Update ${editing.name}.` : 'Add someone to your trips.'}
        </h2>
      </div>
      <FormAlert
        message={
          save.isError && !errors.name && !errors.dateOfBirth ? errorMessage(save.error) : null
        }
      />
      <div className="flex flex-col gap-4 rounded-inset bg-ice p-4 text-navy">
        <Field id="tr-first" label="First name">
          {(control) => (
            <input
              {...control}
              name="firstName"
              type="text"
              autoComplete="off"
              defaultValue={first}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        {/* The API checks the two names as one, so its message sits under the second of them. */}
        <Field id="tr-last" label="Last name" error={errors.name}>
          {(control) => (
            <input
              {...control}
              name="lastName"
              type="text"
              autoComplete="off"
              defaultValue={last}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="tr-birth" label="Date of birth" error={errors.dateOfBirth}>
          {(control) => (
            <input
              {...control}
              name="dateOfBirth"
              type="date"
              defaultValue={editing?.dateOfBirth ?? ''}
              className={INPUT_CLASS}
            />
          )}
        </Field>
      </div>
      <button
        type="submit"
        disabled={save.isPending}
        className={`${SUBMIT_CLASS} focus-visible:outline-teal`}
      >
        {save.isPending ? 'Saving…' : 'Save traveler'}
      </button>
      {editing && (
        <button
          type="button"
          onClick={onDone}
          className="h-11 cursor-pointer rounded-full border border-white/40 text-xs font-bold hover:border-white focus-visible:outline-teal"
        >
          Cancel edit
        </button>
      )}
    </form>
  );
}

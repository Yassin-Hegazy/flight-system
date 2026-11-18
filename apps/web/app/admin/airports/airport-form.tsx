'use client';

import { useMutation } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import { type AirportRecord, saveAirport } from '@/lib/admin-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { ADMIN_CARD, CardHeading, PINK_BUTTON, SMALL_BUTTON } from '../admin-parts';

const FIELDS: { name: keyof AirportRecord; label: string; hint?: string }[] = [
  { name: 'name', label: 'Airport name' },
  { name: 'city', label: 'City' },
  { name: 'country', label: 'Country' },
  { name: 'timezone', label: 'Time zone', hint: 'An IANA zone, e.g. Africa/Cairo.' },
];

/** Adds an airport, or edits one; the IATA code is the key, so it cannot change. */
export function AirportForm({
  editing,
  onDone,
  onSaved,
}: {
  editing: AirportRecord | null;
  onDone: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const save = useMutation({
    mutationFn: saveAirport,
    onSuccess: async () => {
      onDone();
      await onSaved();
    },
  });
  const errors = fieldErrorsOf(save.error);
  const known = ['code', ...FIELDS.map(({ name }) => name)].some((name) => errors[name]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => formText(data, name).trim();
    save.mutate({
      code: (editing?.code ?? text('code')).toUpperCase(),
      name: text('name'),
      city: text('city'),
      country: text('country'),
      timezone: text('timezone'),
    });
  };

  return (
    <form
      key={editing?.code ?? 'new'}
      onSubmit={submit}
      noValidate
      aria-labelledby="airport-form-title"
      className={ADMIN_CARD}
    >
      <CardHeading
        kicker={editing ? 'Edit airport' : 'New airport'}
        title={editing ? `${editing.code} · ${editing.city}` : 'Add an airport'}
        id="airport-form-title"
      />
      <FormAlert message={save.isError && !known ? errorMessage(save.error) : null} />
      <Field id="airport-code" label="IATA code" error={errors.code}>
        {(control) => (
          <input
            {...control}
            name="code"
            maxLength={3}
            disabled={Boolean(editing)}
            defaultValue={editing?.code}
            className={`${INPUT_CLASS} uppercase disabled:bg-ice`}
          />
        )}
      </Field>
      {FIELDS.map(({ name, label, hint }) => (
        <Field key={name} id={`airport-${name}`} label={label} hint={hint} error={errors[name]}>
          {(control) => (
            <input
              {...control}
              name={name}
              defaultValue={editing?.[name]}
              autoComplete="off"
              className={INPUT_CLASS}
            />
          )}
        </Field>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={save.isPending} className={PINK_BUTTON}>
          Save airport
        </button>
        {editing && (
          <button type="button" onClick={onDone} className={`${SMALL_BUTTON} text-navy underline`}>
            Add a new one instead
          </button>
        )}
      </div>
      {save.isSuccess && (
        <p role="status" className="text-sm font-bold">
          Airport saved.
        </p>
      )}
    </form>
  );
}

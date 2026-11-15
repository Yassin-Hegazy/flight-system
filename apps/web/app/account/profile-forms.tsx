'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { changePassword, type ProfilePatch, updateProfile } from '@/lib/account-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { useMe } from '@/lib/auth';

const CARD = 'flex flex-col gap-5 rounded-[22px] bg-card p-5 sm:p-7';
const KNOWN = (errors: Record<string, string>, names: string[]) =>
  names.some((name) => errors[name]);

/** Name, email and phone (US-USR-02). Only what changed is sent; a new email needs the password. */
export function ProfileForm() {
  const me = useMe();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => client.invalidateQueries({ queryKey: ['me'] }),
  });
  const errors = fieldErrorsOf(save.error);
  if (!me) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => formText(data, name).trim();
    const patch: ProfilePatch = {};
    if (text('name') !== me.name) patch.name = text('name');
    if (text('phone')) patch.phone = text('phone');
    if (text('email') !== me.email) {
      patch.email = text('email');
      patch.currentPassword = formText(data, 'currentPassword');
    }
    save.mutate(patch);
  };

  return (
    <form
      key={`${me.name}|${me.email}`}
      onSubmit={submit}
      noValidate
      aria-label="Personal information"
      className={CARD}
    >
      <div>
        <p className="text-[11px] leading-none font-bold text-navy-soft">YOUR PROFILE</p>
        <h2 className="mt-3 text-2xl font-extrabold">Personal information</h2>
      </div>
      <FormAlert
        message={
          save.isError && !KNOWN(errors, ['name', 'email', 'phone', 'currentPassword'])
            ? errorMessage(save.error)
            : null
        }
      />
      <Field id="pf-name" label="Full name" error={errors.name}>
        {(control) => (
          <input
            {...control}
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={me.name}
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <Field id="pf-email" label="Email" error={errors.email}>
        {(control) => (
          <input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={me.email}
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <Field
        id="pf-phone"
        label="Phone (optional)"
        error={errors.phone}
        hint="The number on file is not shown. Fill this in only to change it."
      >
        {(control) => (
          <input {...control} name="phone" type="tel" autoComplete="tel" className={INPUT_CLASS} />
        )}
      </Field>
      <Field
        id="pf-current"
        label="Current password"
        error={errors.currentPassword}
        hint="Only needed when you change your email."
      >
        {(control) => (
          <input
            {...control}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={save.isPending} className={`${SUBMIT_CLASS} sm:w-auto`}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </button>
        {save.isSuccess && (
          <p role="status" className="text-sm font-bold">
            Profile saved.
          </p>
        )}
      </div>
    </form>
  );
}

/** Change password (US-USR-07): the current one proves it is you. */
export function PasswordForm() {
  const form = useRef<HTMLFormElement>(null);
  const change = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(current, next),
    onSuccess: () => form.current?.reset(),
  });
  const errors = fieldErrorsOf(change.error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    change.mutate({ current: formText(data, 'current'), next: formText(data, 'next') });
  };

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-label="Change password"
      className={`${CARD} bg-navy text-white`}
    >
      <div>
        <span aria-hidden="true" className="block h-[5px] w-[62px] rounded bg-pink" />
        <p className="mt-6 text-[11px] leading-none font-bold text-mist">KEEP YOUR ACCOUNT SAFE</p>
        <h2 className="mt-3 text-2xl leading-tight font-extrabold">
          A better password. A safer journey.
        </h2>
      </div>
      <FormAlert
        message={
          change.isError && !KNOWN(errors, ['current', 'next']) ? errorMessage(change.error) : null
        }
      />
      <div className="flex flex-col gap-4 rounded-[14px] bg-card p-4 text-navy">
        <Field id="pw-current" label="Current password" error={errors.current}>
          {(control) => (
            <input
              {...control}
              name="current"
              type="password"
              autoComplete="current-password"
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="pw-next" label="New password" error={errors.next} hint="At least 10 characters.">
          {(control) => (
            <input
              {...control}
              name="next"
              type="password"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          )}
        </Field>
      </div>
      <button
        type="submit"
        disabled={change.isPending}
        className={`${SUBMIT_CLASS} focus-visible:outline-teal`}
      >
        {change.isPending ? 'Updating…' : 'Update password'}
      </button>
      {change.isSuccess && (
        <p role="status" className="text-sm font-bold text-teal">
          Password updated.
        </p>
      )}
    </form>
  );
}

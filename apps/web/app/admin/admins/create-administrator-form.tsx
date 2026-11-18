'use client';

import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useRef } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import { createAdministrator, type NewAdministrator } from '@/lib/admin-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';

const FIELDS = ['name', 'email', 'password', 'phone'];

/** Create another administrator (US-USR-04 AC-3). On success the form empties itself. */
export function CreateAdministratorForm() {
  const form = useRef<HTMLFormElement>(null);
  const create = useMutation({
    mutationFn: (input: NewAdministrator) => createAdministrator(input).then(() => input.email),
    onSuccess: () => form.current?.reset(),
  });
  const errors = fieldErrorsOf(create.error);
  const general = create.isError && !FIELDS.some((name) => errors[name]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const phone = formText(data, 'phone').trim();
    create.mutate({
      name: formText(data, 'name').trim(),
      email: formText(data, 'email').trim(),
      password: formText(data, 'password'),
      ...(phone ? { phone } : {}),
    });
  };

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-labelledby="create-admin-title"
      className="flex flex-col gap-5 rounded-[22px] border border-line bg-white p-5 sm:p-6"
    >
      <div>
        <p className="text-[11px] leading-none font-bold text-navy-soft">ADMIN-ONLY ACTION</p>
        <h2 id="create-admin-title" className="mt-4 text-[29px] leading-tight font-extrabold">
          Create an administrator
        </h2>
        <p className="mt-2 text-sm text-navy-soft">
          This creates an account with the ADMIN role immediately.
        </p>
      </div>
      <FormAlert message={general ? errorMessage(create.error) : null} />
      <Field id="ad-name" label="Full name" error={errors.name}>
        {(control) => (
          <input {...control} name="name" type="text" autoComplete="off" className={INPUT_CLASS} />
        )}
      </Field>
      <Field id="ad-email" label="Email address" error={errors.email}>
        {(control) => (
          <input
            {...control}
            name="email"
            type="email"
            autoComplete="off"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <Field id="ad-password" label="Initial password (min. 10 characters)" error={errors.password}>
        {(control) => (
          <input
            {...control}
            name="password"
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <Field id="ad-phone" label="Phone number (optional)" error={errors.phone}>
        {(control) => (
          <input {...control} name="phone" type="tel" autoComplete="off" className={INPUT_CLASS} />
        )}
      </Field>
      <button
        type="submit"
        disabled={create.isPending}
        className="h-14 w-full cursor-pointer rounded-[15px] bg-pink px-8 text-[13px] font-bold text-navy uppercase hover:brightness-105 focus-visible:outline-navy disabled:opacity-60"
      >
        {create.isPending ? 'Creating…' : 'Create administrator'}
        <span aria-hidden="true" className="ml-3">
          ↗
        </span>
      </button>
      {create.isSuccess && (
        <p role="status" className="text-sm font-bold">
          {create.data} is now an administrator and can sign in.
        </p>
      )}
    </form>
  );
}

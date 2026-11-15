'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { safeNext } from '@/app/sign-in/sign-in-form';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { useRegister } from '@/lib/auth';

const FIELDS = ['name', 'email', 'password', 'phone'];

export function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const register = useRegister();
  const errors = fieldErrorsOf(register.error);
  const placed = FIELDS.some((name) => errors[name]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => formText(data, name).trim();
    register.mutate(
      {
        name: text('name'),
        email: text('email'),
        password: formText(data, 'password'),
        // An empty phone is left out: it is optional, and "" would fail its format check.
        ...(text('phone') ? { phone: text('phone') } : {}),
      },
      { onSuccess: () => router.push(next) },
    );
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Create account" className="flex flex-col gap-5">
      <FormAlert message={register.isError && !placed ? errorMessage(register.error) : null} />
      <Field id="name" label="Full name" error={errors.name}>
        {(control) => (
          <input {...control} name="name" type="text" autoComplete="name" className={INPUT_CLASS} />
        )}
      </Field>
      <Field id="email" label="Email" error={errors.email}>
        {(control) => (
          <input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <Field id="password" label="Password" error={errors.password} hint="At least 10 characters.">
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
      <Field id="phone" label="Phone (optional)" error={errors.phone}>
        {(control) => (
          <input {...control} name="phone" type="tel" autoComplete="tel" className={INPUT_CLASS} />
        )}
      </Field>
      <button type="submit" disabled={register.isPending} className={SUBMIT_CLASS}>
        {register.isPending ? 'Creating…' : 'Create account'}
      </button>
      <p className="text-sm font-medium">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-bold underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

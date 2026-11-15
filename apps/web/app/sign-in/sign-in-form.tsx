'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { useSignIn } from '@/lib/auth';

/** Only paths inside this site are followed after signing in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const signIn = useSignIn();
  const errors = fieldErrorsOf(signIn.error);
  const placed = Object.keys(errors).length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    signIn.mutate(
      { email: formText(data, 'email').trim(), password: formText(data, 'password') },
      { onSuccess: () => router.push(next) },
    );
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Sign in" className="flex flex-col gap-5">
      <FormAlert message={signIn.isError && !placed ? errorMessage(signIn.error) : null} />
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
      <Field id="password" label="Password" error={errors.password}>
        {(control) => (
          <input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <button type="submit" disabled={signIn.isPending} className={SUBMIT_CLASS}>
        {signIn.isPending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-sm font-medium">
        New to aeron?{' '}
        <Link
          href={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}
          className="font-bold underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

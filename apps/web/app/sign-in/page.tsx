import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · aeron' };

export default function SignInPage() {
  return (
    <AuthCard eyebrow="WELCOME BACK" title="Sign in">
      {/* The form reads ?next= from the URL, so it sits in Suspense (Cache Components). */}
      <Suspense fallback={<p role="status">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account · aeron' };

export default function RegisterPage() {
  return (
    <AuthCard eyebrow="NEW HERE" title="Create account">
      <Suspense fallback={<p role="status">Loading…</p>}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}

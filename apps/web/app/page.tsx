'use client';

import { useQuery } from '@tanstack/react-query';

type HealthResponse = {
  status: string;
  database: 'connected' | 'disconnected';
};

async function fetchHealth(): Promise<HealthResponse> {
  // /api/* is rewritten to the API by next.config.ts, so the browser sees a single origin.
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export default function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  let message: string;
  if (health.isPending) {
    message = 'Checking…';
  } else if (health.isError) {
    message = 'API unreachable';
  } else {
    message = `Database ${health.data.database}`;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Flight Booking System</h1>
      <p className="text-muted-foreground">Placeholder page.</p>
      <section aria-labelledby="health-heading" className="rounded-lg border p-4">
        <h2 id="health-heading" className="font-medium">
          API health
        </h2>
        <p data-testid="api-health" aria-live="polite">
          {message}
        </p>
      </section>
    </main>
  );
}

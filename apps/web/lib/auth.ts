'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export interface Me {
  id: string;
  email: string;
  name: string;
  role: 'TRAVELER' | 'ADMIN';
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

const ME = ['me'];

/** Who is signed in: the account, null when nobody is, undefined while it is being asked. */
export function useMe(): Me | null | undefined {
  const query = useQuery({
    queryKey: ME,
    // Anything but an answer (401, an outage) is treated as signed out.
    queryFn: () => api<Me>('/users/me').catch(() => null),
    staleTime: 60_000,
    retry: false,
  });
  return query.data;
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<Me>('/users/sign-in', { method: 'POST', body: input }),
    onSuccess: (me) => client.setQueryData(ME, me),
  });
}

/** Registers, then signs in with the same credentials: the API keeps the two apart. */
export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      await api('/users/register', { method: 'POST', body: input });
      const { email, password } = input;
      return api<Me>('/users/sign-in', { method: 'POST', body: { email, password } });
    },
    onSuccess: (me) => client.setQueryData(ME, me),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api('/users/sign-out', { method: 'POST' }),
    // Everything cached belonged to the account that just left.
    onSuccess: () => {
      client.clear();
      client.setQueryData(ME, null);
    },
  });
}

export const isUnauthenticated = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

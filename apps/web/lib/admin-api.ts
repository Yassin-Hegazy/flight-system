// The administration endpoints. Every call needs an administrator's session; the API answers
// 401 when nobody is signed in and 403 for a traveler.
import { api } from './api';

export interface NewAdministrator {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/** POST /users/admins: an account with the ADMIN role, created at once (US-USR-04 AC-3). */
export function createAdministrator(input: NewAdministrator): Promise<{ id: string }> {
  return api<{ id: string }>('/users/admins', { method: 'POST', body: input });
}

import { api } from './api';
import type { SavedTraveler } from './booking-api';

/** Only the fields that change are sent; a new email also needs currentPassword. */
export interface ProfilePatch {
  name?: string;
  phone?: string;
  email?: string;
  currentPassword?: string;
}

export const updateProfile = (patch: ProfilePatch) =>
  api<null>('/users/me', { method: 'PATCH', body: patch });

export const changePassword = (current: string, next: string) =>
  api<null>('/users/me/password', { method: 'PATCH', body: { current, next } });

export interface TravelerInput {
  /** First name, a space, then the last name. */
  name: string;
  dateOfBirth: string;
}

export const addTraveler = (input: TravelerInput) =>
  api<SavedTraveler>('/users/me/saved-travelers', { method: 'POST', body: input });
export const updateTraveler = (id: string, input: TravelerInput) =>
  api<SavedTraveler>(`/users/me/saved-travelers/${id}`, { method: 'PATCH', body: input });
export const removeTraveler = (id: string) =>
  api<null>(`/users/me/saved-travelers/${id}`, { method: 'DELETE' });

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  /** A path inside this site, e.g. the booking the notification is about. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface Inbox {
  items: Notification[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailPreference {
  type: string;
  email: boolean;
}

export const listNotifications = (page: number) => api<Inbox>(`/notifications?page=${page}`);
export const markRead = (id: string) => api<null>(`/notifications/${id}/read`, { method: 'PATCH' });
export const markAllRead = () => api('/notifications/read-all', { method: 'POST' });
export const getPreferences = () =>
  api<{ preferences: EmailPreference[] }>('/notifications/preferences');
export const setPreference = (type: string, email: boolean) =>
  api<null>(`/notifications/preferences/${type}`, { method: 'PUT', body: { email } });

/** "BookingConfirmed" → "Booking confirmed". */
export const typeLabel = (type: string) =>
  type.replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`);

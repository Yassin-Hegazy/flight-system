import type { Result } from '../../shared/result';
import type { Principal } from './users-access.domain';
import type { SavedTravelerRecord } from './users.repository';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface ProfileInput {
  name?: string;
  phone?: string;
  email?: string;
  currentPassword?: string;
}

export interface SavedTravelerInput {
  name: string;
  dateOfBirth: string;
}

export type SavedTraveler = SavedTravelerRecord;

/** The Users and Access boundary (S1 pack, section 2). */
export interface UsersApi {
  register(input: RegisterInput): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>>;
  signIn(
    email: string,
    password: string,
  ): Promise<Result<string, 'INVALID_CREDENTIALS' | 'LOCKED'>>;
  signOut(token: string): Promise<void>;
  currentUser(token: string | undefined): Promise<Principal | null>;
  updateProfile(userId: string, input: ProfileInput): Promise<Result<void, Record<string, string>>>;
  changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<Result<void, 'INVALID_CURRENT' | 'WEAK_PASSWORD'>>;
  listSavedTravelers(ownerId: string): Promise<SavedTraveler[]>;
  addSavedTraveler(ownerId: string, input: SavedTravelerInput): Promise<SavedTraveler>;
  updateSavedTraveler(
    ownerId: string,
    id: string,
    input: SavedTravelerInput,
  ): Promise<SavedTraveler>;
  deleteSavedTraveler(ownerId: string, id: string): Promise<void>;
}

export const USERS_API = Symbol('USERS_API');

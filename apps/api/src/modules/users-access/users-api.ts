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

export interface ProfileError {
  code: 'VALIDATION_ERROR' | 'EMAIL_TAKEN';
  fieldErrors: Record<string, string>;
}

/** The Users and Access boundary (S1 pack, section 2). */
export interface UsersApi {
  register(input: RegisterInput): Promise<Result<string, 'EMAIL_TAKEN' | 'WEAK_PASSWORD'>>;
  signIn(
    email: string,
    password: string,
  ): Promise<Result<string, 'INVALID_CREDENTIALS' | 'LOCKED'>>;
  signOut(token: string): Promise<void>;
  currentUser(token: string | undefined): Promise<Principal | null>;
  updateProfile(userId: string, input: ProfileInput): Promise<Result<void, ProfileError>>;
  /** Signs out every other session of the user; the one given in keepSession stays (US-USR-07). */
  changePassword(
    userId: string,
    current: string,
    next: string,
    keepSession?: string,
  ): Promise<Result<void, 'INVALID_CURRENT' | 'WEAK_PASSWORD'>>;
  listSavedTravelers(ownerId: string): Promise<SavedTraveler[]>;
  addSavedTraveler(
    ownerId: string,
    input: SavedTravelerInput,
  ): Promise<Result<SavedTraveler, 'SAVED_TRAVELER_LIMIT'>>;
  updateSavedTraveler(
    ownerId: string,
    id: string,
    input: SavedTravelerInput,
  ): Promise<Result<SavedTraveler, 'SAVED_TRAVELER_NOT_FOUND'>>;
  deleteSavedTraveler(
    ownerId: string,
    id: string,
  ): Promise<Result<void, 'SAVED_TRAVELER_NOT_FOUND'>>;
}

export const USERS_API = Symbol('USERS_API');

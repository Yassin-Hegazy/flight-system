import type { Clock } from '../../shared/time';
import { InMemoryUsersRepository } from './in-memory-users.repository';
import type { PasswordHasher } from './password-hasher';
import { UsersAccessService } from './users-access.service';

/** A fast, transparent hasher for unit tests of the use cases; NFR-SEC-01 tests use argon2id. */
export const fakeHasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: (hash, password) => Promise.resolve(hash === `hashed:${password}`),
};

/** A clock the test moves by hand. */
export class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(instant: string | Date): void {
    this.current = new Date(instant);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

export function usersService(start = '2026-11-07T10:00:00Z') {
  const repository = new InMemoryUsersRepository();
  const clock = new ManualClock(new Date(start));
  const service = new UsersAccessService(repository, fakeHasher, clock);
  return { repository, clock, service };
}

import { Inject, Injectable } from '@nestjs/common';
import { USERS_API, type UsersApi } from '../users-access/index';
import type { EmailDirectory } from './email-directory';

/**
 * Adapter pattern, Adapter: the EmailDirectory the email channel expects (the Target), answered
 * by Users and Access, which owns the addresses (the Adaptee).
 */
@Injectable()
export class UsersEmailDirectoryAdapter implements EmailDirectory {
  constructor(@Inject(USERS_API) private readonly users: UsersApi) {}

  emailOf(userId: string): Promise<string | null> {
    return this.users.emailOf(userId);
  }
}

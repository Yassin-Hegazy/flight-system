import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Hashes and checks passwords. Passwords are never stored, only these hashes (NFR-SEC-01). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/** argon2id with its library defaults: deliberately slow, with a random salt in every hash. */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}

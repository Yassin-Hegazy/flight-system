import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './password-hasher';

describe('NFR-SEC-01 passwords are stored only as slow, salted hashes', () => {
  const hasher = new Argon2PasswordHasher();

  it('NFR-SEC-01-T01 uses argon2id, never the password itself', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse battery');
  });

  it('NFR-SEC-01-T02 salts each hash: the same password hashes differently twice', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('correct horse battery'),
      hasher.hash('correct horse battery'),
    ]);
    expect(first).not.toBe(second);
  });

  it('NFR-SEC-01-T03 verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(await hasher.verify(hash, 'correct horse battery')).toBe(true);
    expect(await hasher.verify(hash, 'correct horse batterY')).toBe(false);
  });
});

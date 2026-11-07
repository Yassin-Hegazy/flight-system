import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors';
import {
  type Principal,
  type RequestContext,
  secure,
  type SignedInContext,
  withAuth,
  withOwnership,
  withRole,
} from './access';
import { UserRole } from './users-access.domain';

const alice: Principal = { id: 'alice', email: 'a@x.com', name: 'Alice', role: UserRole.Traveler };
const bob: Principal = { id: 'bob', email: 'b@x.com', name: 'Bob', role: UserRole.Traveler };
const admin: Principal = { id: 'admin', email: 'z@x.com', name: 'Admin', role: UserRole.Admin };

const as = (principal: Principal | null): RequestContext => ({ principal });

// Bookings in this test are owned as follows; anything else does not exist.
const OWNERS: Record<string, string> = { K7M2QP: 'alice' };
const ownerOf = (ref: string) => Promise.resolve(OWNERS[ref] ?? null);

const getBooking = (_ctx: SignedInContext, input: { ref: string }) =>
  Promise.resolve({ ref: input.ref, seen: true });
const cancelBooking = (_ctx: SignedInContext, input: { ref: string }) =>
  Promise.resolve({ ref: input.ref, cancelled: true });

// The same stacks the S1 pack shows in section 7.1.
const view = withAuth(withOwnership(ownerOf, { adminMayRead: true })(getBooking));
const cancel = withAuth(withOwnership(ownerOf)(cancelBooking));
const createFlight = withAuth(
  withRole(UserRole.Admin)((_ctx: SignedInContext, input: { number: string }) =>
    Promise.resolve(input.number),
  ),
);

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected the call to be rejected');
}

describe('US-USR-01 Access only my own bookings and tickets (decorators)', () => {
  it("US-USR-01-T04 another traveler's record is a 404 identical to a record that does not exist", async () => {
    const others = await failure(view(as(bob), { ref: 'K7M2QP' }));
    const missing = await failure(view(as(bob), { ref: 'ZZZZZZ' }));

    expect(others.status).toBe(404);
    expect({ code: others.code, message: others.message }).toEqual({
      code: missing.code,
      message: missing.message,
    });
  });

  it('US-USR-01-T05 the owner can view and act on their own record', async () => {
    expect(await view(as(alice), { ref: 'K7M2QP' })).toEqual({ ref: 'K7M2QP', seen: true });
    expect(await cancel(as(alice), { ref: 'K7M2QP' })).toEqual({ ref: 'K7M2QP', cancelled: true });
  });

  it('US-USR-01-T03 an administrator can view any booking but cannot cancel it directly', async () => {
    expect(await view(as(admin), { ref: 'K7M2QP' })).toEqual({ ref: 'K7M2QP', seen: true });
    expect((await failure(cancel(as(admin), { ref: 'K7M2QP' }))).status).toBe(404);
  });
});

describe('US-USR-03 Restrict administrative actions (decorators)', () => {
  it('US-USR-03-T04 a signed-in traveler is forbidden, and the use case never runs', async () => {
    let ran = false;
    const guarded = withAuth(
      withRole(UserRole.Admin)(() => {
        ran = true;
        return Promise.resolve();
      }),
    );
    expect((await failure(guarded(as(alice), undefined))).status).toBe(403);
    expect(ran).toBe(false);
  });

  it('US-USR-03-T05 an anonymous request is unauthenticated, not forbidden', async () => {
    expect((await failure(createFlight(as(null), { number: 'MS777' }))).status).toBe(401);
    expect((await failure(view(as(null), { ref: 'K7M2QP' }))).status).toBe(401);
  });

  it('US-USR-03-T06 an administrator passes the role check', async () => {
    expect(await createFlight(as(admin), { number: 'MS777' })).toBe('MS777');
  });
});

describe('S1 section 6.1 access policy as data (secure factory)', () => {
  it('US-USR-01-T06 builds the right decorator stack from a policy', async () => {
    const whoAmI = (ctx: SignedInContext) => Promise.resolve(ctx.principal.id);

    expect(
      await secure({ access: 'public' }, () => Promise.resolve('ok'))(as(null), undefined),
    ).toBe('ok');
    expect(
      (await failure(secure({ access: 'signedIn' }, whoAmI)(as(null), undefined))).status,
    ).toBe(401);
    expect(await secure({ access: 'signedIn' }, whoAmI)(as(bob), undefined)).toBe('bob');
    expect((await failure(secure({ access: 'admin' }, whoAmI)(as(bob), undefined))).status).toBe(
      403,
    );
    expect(
      (await failure(secure({ access: 'owner', ownerOf }, getBooking)(as(bob), { ref: 'K7M2QP' })))
        .status,
    ).toBe(404);
  });
});

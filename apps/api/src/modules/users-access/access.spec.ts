import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors';
import {
  Action,
  type Principal,
  type RequestContext,
  signedIn,
  type UseCase,
  UseCaseDecorator,
  WithAuth,
  WithOwnership,
  WithRole,
} from './access';
import { UserRole } from './users-access.domain';

const alice: Principal = { id: 'alice', email: 'a@x.com', name: 'Alice', role: UserRole.Traveler };
const bob: Principal = { id: 'bob', email: 'b@x.com', name: 'Bob', role: UserRole.Traveler };
const admin: Principal = { id: 'admin', email: 'z@x.com', name: 'Admin', role: UserRole.Admin };

const as = (principal: Principal | null): RequestContext => ({ principal });

// Bookings in this test are owned as follows; anything else does not exist.
const OWNERS: Record<string, string> = { K7M2QP: 'alice' };
const ownerOf = (ref: string) => Promise.resolve(OWNERS[ref] ?? null);

// Concrete components: the use cases themselves, with no access checks of their own.
const getBooking = new Action((_ctx: RequestContext, input: { ref: string }) =>
  Promise.resolve({ ref: input.ref, seen: true }),
);
const cancelBooking = new Action((_ctx: RequestContext, input: { ref: string }) =>
  Promise.resolve({ ref: input.ref, cancelled: true }),
);
const createFlightCommand = new Action((_ctx: RequestContext, input: { number: string }) =>
  Promise.resolve(input.number),
);

// The same stacks the S1 pack shows in section 7.1, built as the lecture builds a decorator:
// a concrete decorator constructed around a component.
const view: UseCase<{ ref: string }, unknown> = new WithAuth(
  new WithOwnership(getBooking, ownerOf, { adminMayRead: true }),
);
const cancel: UseCase<{ ref: string }, unknown> = new WithAuth(
  new WithOwnership(cancelBooking, ownerOf),
);
const createFlight: UseCase<{ number: string }, string> = new WithAuth(
  new WithRole(createFlightCommand, UserRole.Admin),
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
    const others = await failure(view.execute(as(bob), { ref: 'K7M2QP' }));
    const missing = await failure(view.execute(as(bob), { ref: 'ZZZZZZ' }));

    expect(others.status).toBe(404);
    expect({ code: others.code, message: others.message }).toEqual({
      code: missing.code,
      message: missing.message,
    });
  });

  it('US-USR-01-T05 the owner can view and act on their own record', async () => {
    expect(await view.execute(as(alice), { ref: 'K7M2QP' })).toEqual({ ref: 'K7M2QP', seen: true });
    expect(await cancel.execute(as(alice), { ref: 'K7M2QP' })).toEqual({
      ref: 'K7M2QP',
      cancelled: true,
    });
  });

  it('US-USR-01-T03 an administrator can view any booking but cannot cancel it directly', async () => {
    expect(await view.execute(as(admin), { ref: 'K7M2QP' })).toEqual({ ref: 'K7M2QP', seen: true });
    expect((await failure(cancel.execute(as(admin), { ref: 'K7M2QP' }))).status).toBe(404);
  });
});

describe('US-USR-03 Restrict administrative actions (decorators)', () => {
  it('US-USR-03-T04 a signed-in traveler is forbidden, and the use case never runs', async () => {
    let ran = false;
    const guarded = new WithAuth(
      new WithRole(
        new Action(() => {
          ran = true;
          return Promise.resolve();
        }),
        UserRole.Admin,
      ),
    );
    expect((await failure(guarded.execute(as(alice), undefined))).status).toBe(403);
    expect(ran).toBe(false);
  });

  it('US-USR-03-T05 an anonymous request is unauthenticated, not forbidden', async () => {
    expect((await failure(createFlight.execute(as(null), { number: 'MS777' }))).status).toBe(401);
    expect((await failure(view.execute(as(null), { ref: 'K7M2QP' }))).status).toBe(401);
  });

  it('US-USR-03-T06 an administrator passes the role check', async () => {
    expect(await createFlight.execute(as(admin), { number: 'MS777' })).toBe('MS777');
  });
});

describe('S1 section 7 Decorator: component, decorator and concrete decorators', () => {
  it('US-USR-01-T06 a decorator has the interface of the component it wraps, so decorators stack', async () => {
    const whoAmI = new Action((ctx: RequestContext) => Promise.resolve(signedIn(ctx).id));
    const stacked: UseCase<undefined, string> = new WithAuth(new WithRole(whoAmI, UserRole.Admin));

    expect(stacked).toBeInstanceOf(UseCaseDecorator);
    expect(await stacked.execute(as(admin), undefined)).toBe('admin');
  });

  it('US-USR-01-T10 the base decorator only delegates to its component', async () => {
    class Plain extends UseCaseDecorator<{ ref: string }, unknown> {}

    expect(await new Plain(getBooking).execute(as(null), { ref: 'K7M2QP' })).toEqual({
      ref: 'K7M2QP',
      seen: true,
    });
  });

  it('US-USR-03-T07 role and ownership decorators refuse an anonymous caller on their own', async () => {
    const roleOnly = new WithRole(createFlightCommand, UserRole.Admin);
    const ownerOnly = new WithOwnership(getBooking, ownerOf);

    expect((await failure(roleOnly.execute(as(null), { number: 'MS777' }))).status).toBe(401);
    expect((await failure(ownerOnly.execute(as(null), { ref: 'K7M2QP' }))).status).toBe(401);
  });
});

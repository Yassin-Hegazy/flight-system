import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../shared/errors';
import { type Principal, UserRole } from './users-access.domain';

export type { Principal } from './users-access.domain';

/**
 * Who is making the request. The principal comes from the server-side session on every request,
 * never from anything the client sends (US-USR-03 AC-3).
 */
export interface RequestContext {
  principal: Principal | null;
}

/**
 * Component (the lecture's IComponent): a use case. Given who is asking and the input, it produces
 * the output. Decorators have this same interface, which is why they can wrap one another.
 */
export interface UseCase<I, O> {
  execute(ctx: RequestContext, input: I): Promise<O>;
}

/** Concrete component: the action itself, with no access checks of its own. */
export class Action<I, O> implements UseCase<I, O> {
  constructor(private readonly run: (ctx: RequestContext, input: I) => Promise<O>) {}

  execute(ctx: RequestContext, input: I): Promise<O> {
    return this.run(ctx, input);
  }
}

/** The signed-in user of a request, or a 401 when nobody is signed in. */
export function signedIn(ctx: RequestContext): Principal {
  if (!ctx.principal) throw AppError.unauthenticated();
  return ctx.principal;
}

/**
 * Decorator: holds the component it wraps and passes the call on to it. The concrete decorators
 * below add one access check each before doing the same.
 */
export abstract class UseCaseDecorator<I, O> implements UseCase<I, O> {
  constructor(protected readonly component: UseCase<I, O>) {}

  execute(ctx: RequestContext, input: I): Promise<O> {
    return this.component.execute(ctx, input);
  }
}

/** Concrete decorator: the wrapped use case runs only for a signed-in user (401 otherwise). */
export class WithAuth<I, O> extends UseCaseDecorator<I, O> {
  override async execute(ctx: RequestContext, input: I): Promise<O> {
    signedIn(ctx);
    return super.execute(ctx, input);
  }
}

/** Concrete decorator: the wrapped use case runs only for the given role (403 otherwise). */
export class WithRole<I, O> extends UseCaseDecorator<I, O> {
  constructor(
    component: UseCase<I, O>,
    private readonly role: UserRole,
  ) {
    super(component);
  }

  override async execute(ctx: RequestContext, input: I): Promise<O> {
    if (signedIn(ctx).role !== this.role) throw AppError.forbidden();
    return super.execute(ctx, input);
  }
}

export type OwnerLookup = (ref: string) => Promise<string | null>;

// The same answer for "not yours" and "does not exist", so a response never confirms that someone
// else's record exists (S1 section 3.4).
const notFound = () => AppError.notFound('NOT_FOUND', 'Not found.');

/**
 * Concrete decorator: the wrapped use case runs only on the caller's own record (S1 section 6.2).
 * The order of the steps is the security property: authenticate, load the owner, compare, and only
 * then act. Admins may read anyone's record only where the route opts in with adminMayRead
 * (US-USR-01 AC-3).
 */
export class WithOwnership<I extends { ref: string }, O> extends UseCaseDecorator<I, O> {
  constructor(
    component: UseCase<I, O>,
    private readonly ownerOf: OwnerLookup,
    private readonly options: { adminMayRead?: boolean } = {},
  ) {
    super(component);
  }

  override async execute(ctx: RequestContext, input: I): Promise<O> {
    const principal = signedIn(ctx);
    const owner = await this.ownerOf(input.ref);
    if (owner === null) throw notFound();
    const isOwner = owner === principal.id;
    const adminRead = principal.role === UserRole.Admin && this.options.adminMayRead === true;
    if (!isOwner && !adminRead) throw notFound();
    return super.execute(ctx, input);
  }
}

/** A request after PrincipalMiddleware has run. */
export type RequestWithPrincipal = Request & { principal?: Principal | null };

/** Route parameter decorator: the RequestContext of the current request. */
export const Ctx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => ({
    principal: context.switchToHttp().getRequest<RequestWithPrincipal>().principal ?? null,
  }),
);

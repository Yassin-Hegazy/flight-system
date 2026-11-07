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

/** The context a use case receives once withAuth has run: someone is signed in. */
export interface SignedInContext {
  principal: Principal;
}

/** A use case: given who is asking and the input, produce the output. */
export type UseCase<I, O, C = RequestContext> = (ctx: C, input: I) => Promise<O>;

export type OwnerLookup = (ref: string) => Promise<string | null>;

// The same answer for "not yours" and "does not exist", so a response never confirms that someone
// else's record exists (S1 section 3.4).
const notFound = () => AppError.notFound('NOT_FOUND', 'Not found.');

/**
 * Decorator: the wrapped use case runs only for a signed-in user (401 otherwise). Like every
 * decorator here, it returns a function with the same shape, so decorators stack.
 */
export function withAuth<I, O>(useCase: UseCase<I, O, SignedInContext>): UseCase<I, O> {
  return async (ctx, input) => {
    if (!ctx.principal) throw AppError.unauthenticated();
    return useCase({ principal: ctx.principal }, input);
  };
}

/** Decorator: the wrapped use case runs only for the given role (403 otherwise). */
export function withRole(role: UserRole) {
  return <I, O>(useCase: UseCase<I, O, SignedInContext>): UseCase<I, O, SignedInContext> =>
    async (ctx, input) => {
      if (ctx.principal.role !== role) throw AppError.forbidden();
      return useCase(ctx, input);
    };
}

/**
 * Decorator: the wrapped use case runs only on the caller's own record (S1 section 6.2). The order
 * of the steps is the security property: load the owner, compare, and only then act. Admins may
 * read anyone's record only where the route opts in with adminMayRead (US-USR-01 AC-3).
 */
export function withOwnership(ownerOf: OwnerLookup, options: { adminMayRead?: boolean } = {}) {
  return <I extends { ref: string }, O>(
      useCase: UseCase<I, O, SignedInContext>,
    ): UseCase<I, O, SignedInContext> =>
    async (ctx, input) => {
      const owner = await ownerOf(input.ref);
      if (owner === null) throw notFound();
      const isOwner = owner === ctx.principal.id;
      const adminRead = ctx.principal.role === UserRole.Admin && options.adminMayRead === true;
      if (!isOwner && !adminRead) throw notFound();
      return useCase(ctx, input);
    };
}

/** Who may call a route, as data a reviewer can read at a glance (S1 section 6.1). */
export type AccessPolicy =
  | { access: 'public' }
  | { access: 'signedIn' }
  | { access: 'admin' }
  | { access: 'owner'; ownerOf: OwnerLookup; adminMayRead?: boolean };

/**
 * Simple Factory: builds the decorator stack a policy calls for, so routes name a policy instead of
 * assembling guards by hand.
 */
export function secure<I, O>(policy: { access: 'public' }, useCase: UseCase<I, O>): UseCase<I, O>;
export function secure<I, O>(
  policy: { access: 'signedIn' } | { access: 'admin' },
  useCase: UseCase<I, O, SignedInContext>,
): UseCase<I, O>;
export function secure<I extends { ref: string }, O>(
  policy: { access: 'owner'; ownerOf: OwnerLookup; adminMayRead?: boolean },
  useCase: UseCase<I, O, SignedInContext>,
): UseCase<I, O>;
export function secure(
  policy: AccessPolicy,
  useCase: UseCase<{ ref: string }, unknown, SignedInContext> | UseCase<unknown, unknown>,
): UseCase<{ ref: string }, unknown> {
  switch (policy.access) {
    case 'public':
      return useCase as UseCase<{ ref: string }, unknown>;
    case 'signedIn':
      return withAuth(useCase as UseCase<{ ref: string }, unknown, SignedInContext>);
    case 'admin':
      return withAuth(
        withRole(UserRole.Admin)(useCase as UseCase<{ ref: string }, unknown, SignedInContext>),
      );
    case 'owner':
      return withAuth(
        withOwnership(policy.ownerOf, { adminMayRead: policy.adminMayRead })(
          useCase as UseCase<{ ref: string }, unknown, SignedInContext>,
        ),
      );
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

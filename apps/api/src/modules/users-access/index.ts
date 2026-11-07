// Users and Access: the only file other modules may import.
// Routes in every module wrap their use cases with these decorators, or name a policy for secure().
export { UsersAccessModule } from './users-access.module';
export { USERS_API } from './users-api';
export type { UsersApi } from './users-api';
export { Ctx, secure, withAuth, withOwnership, withRole } from './access';
export type { AccessPolicy, OwnerLookup, RequestContext, SignedInContext, UseCase } from './access';
export { UserRole } from './users-access.domain';
export type { Principal } from './users-access.domain';

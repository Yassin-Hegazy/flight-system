// Users and Access: the only file other modules may import.
// Routes in every module wrap their use cases with the access decorators (Decorator pattern).
export { UsersAccessModule } from './users-access.module';
export { USERS_API } from './users-api';
export type { UsersApi } from './users-api';
export {
  Action,
  Ctx,
  signedIn,
  UseCaseDecorator,
  WithAuth,
  WithOwnership,
  WithRole,
} from './access';
export type { OwnerLookup, RequestContext, UseCase } from './access';
export { UserRole } from './users-access.domain';
export type { Principal } from './users-access.domain';

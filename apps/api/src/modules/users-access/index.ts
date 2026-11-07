export { UsersAccessModule } from './users-access.module';
export { UsersAccessService } from './users-access.service';
export { AuthGuard, OwnershipGuard, RoleGuard } from './users-access.guards';
export { withAuth, withOwnership, withRole, UserRole } from './users-access.domain';
export type { Principal } from './users-access.domain';
export { USERS_API } from './users-api';
export type { UsersApi } from './users-api';

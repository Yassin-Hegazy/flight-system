import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Principal, UserRole } from './users-access.domain';
import { SESSION_COOKIE, UsersAccessService } from './users-access.service';

function tokenFrom(request: Request): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly service: UsersAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    const principal = await this.service.currentUser(tokenFrom(request));
    if (!principal)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in required' });
    request.user = principal;
    return true;
  }
}

export class RoleGuard implements CanActivate {
  constructor(private readonly required: UserRole) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    if (!request.user)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in required' });
    if (request.user.role !== this.required)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Administrator access required' });
    return true;
  }
}

export class OwnershipGuard implements CanActivate {
  constructor(private readonly loader: (id: string) => Promise<string | null>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    if (!request.user)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in required' });
    const resourceId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const ownerId = await this.loader(resourceId);
    if (request.user.role !== UserRole.Admin && ownerId !== request.user.id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    }
    return true;
  }
}

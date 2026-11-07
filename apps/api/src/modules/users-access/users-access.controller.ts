import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, validationError } from '../../shared/errors';
import { Ctx, type Principal, type RequestContext, secure } from './access';
import { SESSION_COOKIE, sessionTokenFrom } from './principal.middleware';
import {
  ChangePasswordInput,
  ProfileInput,
  RegisterInput,
  SavedTravelerInput,
  SignInInput,
} from './users-access.dto';
import { type SavedTraveler, USERS_API, type UsersApi } from './users-api';

const PUBLIC = { access: 'public' } as const;
const SIGNED_IN = { access: 'signedIn' } as const;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

function travelerNotFound(): AppError {
  return AppError.notFound('SAVED_TRAVELER_NOT_FOUND', 'Saved traveler not found.');
}

// A malformed ID gets the same answer as an unknown one, so the response reveals nothing extra.
const TRAVELER_ID = new ParseUUIDPipe({ exceptionFactory: travelerNotFound });

/**
 * Account routes. Each route names its access policy and runs its use case through secure(), which
 * builds the matching decorator stack; the controller only maps results to HTTP.
 */
@Controller('users')
export class UsersAccessController {
  constructor(@Inject(USERS_API) private readonly users: UsersApi) {}

  @Post('register')
  register(@Ctx() ctx: RequestContext, @Body() input: RegisterInput): Promise<{ id: string }> {
    return secure(PUBLIC, async () => {
      const result = await this.users.register(input);
      if (result.ok) return { id: result.value };
      if (result.error === 'EMAIL_TAKEN') {
        throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists.', {
          email: 'Email address is already in use',
        });
      }
      throw validationError({ password: 'Password does not meet the requirements' });
    })(ctx, undefined);
  }

  /**
   * On success the session token is set only as an HttpOnly cookie; the body carries who signed in,
   * never the token (S1 section 3.3). Both failure reasons are a 401, and an unknown email gets the
   * same response as a wrong password (US-USR-05 AC-1).
   */
  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body() input: SignInInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Principal | null> {
    const result = await this.users.signIn(input.email, input.password);
    if (!result.ok) {
      throw result.error === 'LOCKED'
        ? AppError.unauthenticated('SIGN_IN_LOCKED', 'Too many failed attempts. Try again later.')
        : AppError.unauthenticated('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    response.cookie(SESSION_COOKIE, result.value, { ...COOKIE_OPTIONS, maxAge: 86_400_000 });
    return this.users.currentUser(result.value);
  }

  /** Deletes the server-side session, so a copied cookie stops working (US-USR-05 AC-2). */
  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = sessionTokenFrom(request.headers.cookie);
    if (token) await this.users.signOut(token);
    response.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
  }

  @Get('me')
  me(@Ctx() ctx: RequestContext): Promise<Principal> {
    return secure(SIGNED_IN, ({ principal }) => Promise.resolve(principal))(ctx, undefined);
  }

  @Patch('me')
  @HttpCode(204)
  updateProfile(@Ctx() ctx: RequestContext, @Body() input: ProfileInput): Promise<void> {
    return secure(SIGNED_IN, async ({ principal }) => {
      const result = await this.users.updateProfile(principal.id, input);
      if (result.ok) return;
      if (result.error.code === 'EMAIL_TAKEN') {
        throw AppError.conflict(
          'EMAIL_TAKEN',
          'An account with this email already exists.',
          result.error.fieldErrors,
        );
      }
      throw validationError(result.error.fieldErrors);
    })(ctx, undefined);
  }

  @Patch('me/password')
  @HttpCode(204)
  changePassword(
    @Ctx() ctx: RequestContext,
    @Req() request: Request,
    @Body() input: ChangePasswordInput,
  ): Promise<void> {
    return secure(SIGNED_IN, async ({ principal }) => {
      const result = await this.users.changePassword(
        principal.id,
        input.current,
        input.next,
        sessionTokenFrom(request.headers.cookie),
      );
      if (result.ok) return;
      throw result.error === 'INVALID_CURRENT'
        ? validationError({ current: 'Current password is incorrect' })
        : validationError({ next: 'Password does not meet the requirements' });
    })(ctx, undefined);
  }

  // Saved travelers are always read and written through the signed-in owner's ID, so another
  // user's traveler is simply not found (US-USR-06 AC-3).

  @Get('me/saved-travelers')
  listSavedTravelers(@Ctx() ctx: RequestContext): Promise<SavedTraveler[]> {
    return secure(SIGNED_IN, ({ principal }) => this.users.listSavedTravelers(principal.id))(
      ctx,
      undefined,
    );
  }

  @Post('me/saved-travelers')
  addSavedTraveler(
    @Ctx() ctx: RequestContext,
    @Body() input: SavedTravelerInput,
  ): Promise<SavedTraveler> {
    return secure(SIGNED_IN, async ({ principal }) => {
      const result = await this.users.addSavedTraveler(principal.id, input);
      if (!result.ok) {
        throw AppError.conflict('SAVED_TRAVELER_LIMIT', 'You can save up to 10 travelers.');
      }
      return result.value;
    })(ctx, undefined);
  }

  @Patch('me/saved-travelers/:id')
  updateSavedTraveler(
    @Ctx() ctx: RequestContext,
    @Param('id', TRAVELER_ID) id: string,
    @Body() input: SavedTravelerInput,
  ): Promise<SavedTraveler> {
    return secure(SIGNED_IN, async ({ principal }) => {
      const result = await this.users.updateSavedTraveler(principal.id, id, input);
      if (!result.ok) throw travelerNotFound();
      return result.value;
    })(ctx, undefined);
  }

  @Delete('me/saved-travelers/:id')
  @HttpCode(204)
  deleteSavedTraveler(
    @Ctx() ctx: RequestContext,
    @Param('id', TRAVELER_ID) id: string,
  ): Promise<void> {
    return secure(SIGNED_IN, async ({ principal }) => {
      const result = await this.users.deleteSavedTraveler(principal.id, id);
      if (!result.ok) throw travelerNotFound();
    })(ctx, undefined);
  }
}

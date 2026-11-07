import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, validationError } from '../../shared/errors';
import type { Principal } from './users-access.domain';
import type { SavedTraveler } from './users-api';
import { AuthGuard } from './users-access.guards';
import {
  ChangePasswordInput,
  ProfileInput,
  RegisterInput,
  SavedTravelerInput,
  SignInInput,
} from './users-access.dto';
import { SESSION_COOKIE, UsersAccessService } from './users-access.service';

const tokenFrom = (request: Request): string | undefined => {
  const value = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return value?.slice(SESSION_COOKIE.length + 1);
};
type AuthRequest = Request & { user: { id: string } };

function travelerNotFound(): AppError {
  return AppError.notFound('SAVED_TRAVELER_NOT_FOUND', 'Saved traveler not found.');
}

// A malformed ID gets the same answer as an unknown one, so the response reveals nothing extra.
const TRAVELER_ID = new ParseUUIDPipe({ exceptionFactory: travelerNotFound });

@Controller('users')
export class UsersAccessController {
  constructor(private readonly service: UsersAccessService) {}

  @Post('register')
  async register(@Body() input: RegisterInput): Promise<{ id: string }> {
    const result = await this.service.register(input);
    if (result.ok) return { id: result.value };
    if (result.error === 'EMAIL_TAKEN') {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists.', {
        email: 'Email address is already in use',
      });
    }
    throw validationError({ password: 'Password does not meet the requirements' });
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
    const result = await this.service.signIn(input.email, input.password);
    if (!result.ok) {
      throw result.error === 'LOCKED'
        ? AppError.unauthenticated('SIGN_IN_LOCKED', 'Too many failed attempts. Try again later.')
        : AppError.unauthenticated('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    response.cookie(SESSION_COOKIE, result.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86_400_000,
      path: '/',
    });
    return this.service.currentUser(result.value);
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = tokenFrom(request);
    if (token) await this.service.signOut(token);
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  currentUser(@Req() request: AuthRequest) {
    return request.user;
  }

  @Patch('me')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async updateProfile(@Req() request: AuthRequest, @Body() input: ProfileInput): Promise<void> {
    const result = await this.service.updateProfile(request.user.id, input);
    if (result.ok) return;
    if (result.error.code === 'EMAIL_TAKEN') {
      throw AppError.conflict(
        'EMAIL_TAKEN',
        'An account with this email already exists.',
        result.error.fieldErrors,
      );
    }
    throw validationError(result.error.fieldErrors);
  }

  @Patch('me/password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() request: AuthRequest,
    @Body() input: ChangePasswordInput,
  ): Promise<void> {
    const result = await this.service.changePassword(request.user.id, input.current, input.next);
    if (result.ok) return;
    throw result.error === 'INVALID_CURRENT'
      ? validationError({ current: 'Current password is incorrect' })
      : validationError({ next: 'Password does not meet the requirements' });
  }

  @Get('me/saved-travelers')
  @UseGuards(AuthGuard)
  listSavedTravelers(@Req() request: AuthRequest): Promise<SavedTraveler[]> {
    return this.service.listSavedTravelers(request.user.id);
  }

  @Post('me/saved-travelers')
  @UseGuards(AuthGuard)
  async addSavedTraveler(
    @Req() request: AuthRequest,
    @Body() input: SavedTravelerInput,
  ): Promise<SavedTraveler> {
    const result = await this.service.addSavedTraveler(request.user.id, input);
    if (!result.ok) {
      throw AppError.conflict('SAVED_TRAVELER_LIMIT', 'You can save up to 10 travelers.');
    }
    return result.value;
  }

  @Patch('me/saved-travelers/:id')
  @UseGuards(AuthGuard)
  async updateSavedTraveler(
    @Req() request: AuthRequest,
    @Param('id', TRAVELER_ID) id: string,
    @Body() input: SavedTravelerInput,
  ): Promise<SavedTraveler> {
    const result = await this.service.updateSavedTraveler(request.user.id, id, input);
    if (!result.ok) throw travelerNotFound();
    return result.value;
  }

  @Delete('me/saved-travelers/:id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteSavedTraveler(
    @Req() request: AuthRequest,
    @Param('id', TRAVELER_ID) id: string,
  ): Promise<void> {
    const result = await this.service.deleteSavedTraveler(request.user.id, id);
    if (!result.ok) throw travelerNotFound();
  }
}

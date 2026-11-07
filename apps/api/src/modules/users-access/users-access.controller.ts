import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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

@Controller('users')
export class UsersAccessController {
  constructor(private readonly service: UsersAccessService) {}

  @Post('register')
  register(@Body() input: RegisterInput) {
    return this.service.register(input);
  }

  /**
   * On success the session token is set only as an HttpOnly cookie; the body carries who signed in,
   * never the token (S1 section 3.3).
   */
  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() input: SignInInput, @Res({ passthrough: true }) response: Response) {
    const result = await this.service.signIn(input.email, input.password);
    if (!result.ok) return result;
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
  async signOut(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
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
  @UseGuards(AuthGuard)
  updateProfile(@Req() request: AuthRequest, @Body() input: ProfileInput) {
    return this.service.updateProfile(request.user.id, input);
  }

  @Patch('me/password')
  @UseGuards(AuthGuard)
  changePassword(@Req() request: AuthRequest, @Body() input: ChangePasswordInput) {
    return this.service.changePassword(request.user.id, input.current, input.next);
  }

  @Get('me/saved-travelers')
  @UseGuards(AuthGuard)
  listSavedTravelers(@Req() request: AuthRequest) {
    return this.service.listSavedTravelers(request.user.id);
  }

  @Post('me/saved-travelers')
  @UseGuards(AuthGuard)
  addSavedTraveler(@Req() request: AuthRequest, @Body() input: SavedTravelerInput) {
    return this.service.addSavedTraveler(request.user.id, input);
  }

  @Patch('me/saved-travelers/:id')
  @UseGuards(AuthGuard)
  updateSavedTraveler(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() input: SavedTravelerInput,
  ) {
    return this.service.updateSavedTraveler(request.user.id, id, input);
  }

  @Delete('me/saved-travelers/:id')
  @UseGuards(AuthGuard)
  deleteSavedTraveler(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.service.deleteSavedTraveler(request.user.id, id);
  }
}

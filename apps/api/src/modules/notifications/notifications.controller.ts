import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiSession } from '../../shared/api-docs';
import { AppError } from '../../shared/errors';
import {
  Action,
  Ctx,
  type Principal,
  type RequestContext,
  signedIn,
  WithAuth,
  WithOwnership,
} from '../users-access/index';
import { InboxQuery, PreferenceBody } from './notifications.dto';
import {
  type InboxPage,
  NOTIFICATIONS_API,
  type NotificationPreference,
  type NotificationsApi,
  PREFERENCES_API,
  type PreferencesApi,
} from './notifications-api';

/**
 * Inbox routes. Each route wraps its use case (an Action) in the access decorators it needs and
 * executes the result; the controller only maps results to HTTP. Every route works on the
 * signed-in user's own notifications, so there is no way to ask for someone else's list.
 */
@ApiTags('Notifications')
@ApiSession()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATIONS_API) private readonly notifications: NotificationsApi,
    @Inject(PREFERENCES_API) private readonly preferenceSettings: PreferencesApi,
  ) {}

  /** Runs `run` for the signed-in user only: nobody signed in is a 401 before anything else. */
  private forSignedInUser<O>(
    ctx: RequestContext,
    run: (user: Principal) => Promise<O>,
  ): Promise<O> {
    const action = new Action<undefined, O>((context) => run(signedIn(context)));
    return new WithAuth(action).execute(ctx, undefined);
  }

  /** The user's notifications, newest first, 20 per page, with the unread count (US-NT-04). */
  @Get()
  @ApiOperation({ summary: 'Read your in-app inbox, newest first' })
  @ApiOkResponse({ description: 'One page of notifications and the unread count.' })
  @ApiErrors(400)
  inbox(@Ctx() ctx: RequestContext, @Query() query: InboxQuery): Promise<InboxPage> {
    return this.forSignedInUser(ctx, (user) => this.notifications.inbox(user.id, query.page ?? 1));
  }

  /** Marks every unread notification of the signed-in user as read (US-NT-05). */
  @Post('read-all')
  @ApiOperation({ summary: 'Mark all your notifications as read' })
  @ApiOkResponse({ description: 'How many were marked.' })
  @HttpCode(200)
  markAllRead(@Ctx() ctx: RequestContext): Promise<{ updated: number }> {
    return this.forSignedInUser(ctx, async (user) => ({
      updated: await this.notifications.markAllRead(user.id),
    }));
  }

  /**
   * Marks one notification as read (US-NT-03). The ownership decorator answers "not found" for
   * another user's notification, exactly as for one that does not exist; administrators get no
   * exception because the route does not opt in to adminMayRead.
   */
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of your notifications as read' })
  @ApiNoContentResponse({ description: 'Marked.' })
  @ApiErrors(404)
  @HttpCode(204)
  markRead(@Ctx() ctx: RequestContext, @Param('id') id: string): Promise<void> {
    const markOwnRead = new Action<{ ref: string }, void>(async (context, input) => {
      const result = await this.notifications.markRead(input.ref, signedIn(context).id);
      if (!result.ok) throw AppError.notFound('NOT_FOUND', 'Not found.');
    });
    const ownerOf = (ref: string) => this.notifications.ownerOf(ref);
    return new WithOwnership(markOwnRead, ownerOf).execute(ctx, { ref: id });
  }

  /** Every notification type with the user's email choice (US-NT-07). */
  @Get('preferences')
  @ApiOperation({ summary: 'Read your email preference for each notification type' })
  @ApiOkResponse({ description: 'One entry per notification type.' })
  preferences(@Ctx() ctx: RequestContext): Promise<{ preferences: NotificationPreference[] }> {
    return this.forSignedInUser(ctx, async (user) => ({
      preferences: await this.preferenceSettings.preferences(user.id),
    }));
  }

  /** Opts in to, or out of, email for one notification type (US-NT-07 AC-1). */
  @Put('preferences/:type')
  @ApiOperation({ summary: 'Turn email on or off for one notification type' })
  @ApiNoContentResponse({ description: 'Saved.' })
  @ApiErrors(400, 404)
  @HttpCode(204)
  setPreference(
    @Ctx() ctx: RequestContext,
    @Param('type') type: string,
    @Body() body: PreferenceBody,
  ): Promise<void> {
    return this.forSignedInUser(ctx, async (user) => {
      const result = await this.preferenceSettings.setEmailPreference(user.id, type, body.email);
      if (!result.ok) throw AppError.notFound('NOT_FOUND', 'Not found.');
    });
  }
}

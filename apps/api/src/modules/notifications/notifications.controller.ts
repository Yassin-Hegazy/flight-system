import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { AppError } from '../../shared/errors';
import { Ctx, type RequestContext, secure } from '../users-access/index';
import { InboxQuery } from './notifications.dto';
import { type InboxPage, NOTIFICATIONS_API, type NotificationsApi } from './notifications-api';

const SIGNED_IN = { access: 'signedIn' } as const;

/**
 * Inbox routes. Each route names its access policy and runs its use case through secure(); the
 * controller only maps results to HTTP. Every route works on the signed-in user's own
 * notifications, so there is no way to ask for someone else's list.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NOTIFICATIONS_API) private readonly notifications: NotificationsApi) {}

  /** The user's notifications, newest first, 20 per page, with the unread count (US-NT-04). */
  @Get()
  inbox(@Ctx() ctx: RequestContext, @Query() query: InboxQuery): Promise<InboxPage> {
    return secure(SIGNED_IN, ({ principal }) =>
      this.notifications.inbox(principal.id, query.page ?? 1),
    )(ctx, undefined);
  }

  /** Marks every unread notification of the signed-in user as read (US-NT-05). */
  @Post('read-all')
  @HttpCode(200)
  markAllRead(@Ctx() ctx: RequestContext): Promise<{ updated: number }> {
    return secure(SIGNED_IN, async ({ principal }) => ({
      updated: await this.notifications.markAllRead(principal.id),
    }))(ctx, undefined);
  }

  /**
   * Marks one notification as read (US-NT-03). The ownership guard answers "not found" for another
   * user's notification, exactly as for one that does not exist; administrators get no exception.
   */
  @Patch(':id/read')
  @HttpCode(204)
  markRead(@Ctx() ctx: RequestContext, @Param('id') id: string): Promise<void> {
    const ownedByCaller = {
      access: 'owner',
      ownerOf: (ref: string) => this.notifications.ownerOf(ref),
    } as const;
    return secure(ownedByCaller, async ({ principal }, input: { ref: string }) => {
      const result = await this.notifications.markRead(input.ref, principal.id);
      if (!result.ok) throw AppError.notFound('NOT_FOUND', 'Not found.');
    })(ctx, { ref: id });
  }
}

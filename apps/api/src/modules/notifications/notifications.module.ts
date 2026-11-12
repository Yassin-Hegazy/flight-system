import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { DepartureReminderJob } from './departure-reminder.job';
import { DepartureReminderService } from './departure-reminder.service';
import { DEPARTURE_SOURCE, NoDepartureSource } from './departure-source';
import { EMAIL_DIRECTORY, NoEmailDirectory } from './email-directory';
import { EmailChannel } from './email.channel';
import { LocalMailCatcher } from './local-mail-catcher';
import { MAIL_TRANSPORT } from './mail';
import { NOTIFICATION_CHANNELS } from './notification-channel';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { NotificationEventHandler } from './notification-event.handler';
import { NotificationPrefEntity } from './notification-pref.entity';
import { NotificationEntity } from './notification.entity';
import { NOTIFICATIONS_API } from './notifications-api';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { PgNotificationsRepository } from './pg-notifications.repository';
import { PgPreferencesRepository } from './pg-preferences.repository';
import { PREFERENCES_REPOSITORY } from './preferences.repository';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, NotificationPrefEntity])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // The Observer. It subscribes itself to the app's global event emitter when the module starts,
    // so no other module needs to know it exists.
    NotificationEventHandler,
    // The scheduled reminder job. ScheduleModule (in app.module.ts) finds it by its @Cron.
    DepartureReminderJob,
    DepartureReminderService,
    NotificationChannelDispatcher,
    // Delivery channels: email, for travelers who opted in. Add a channel here to add a way out.
    EmailChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (email: EmailChannel) => [email],
      inject: [EmailChannel],
    },
    LocalMailCatcher,
    { provide: MAIL_TRANSPORT, useExisting: LocalMailCatcher },
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PgNotificationsRepository },
    { provide: PREFERENCES_REPOSITORY, useClass: PgPreferencesRepository },
    { provide: NOTIFICATIONS_API, useExisting: NotificationsService },
    { provide: CLOCK, useValue: systemClock },

    // Integration points owned by other modules. Each default below does nothing until the owning
    // module provides the real thing: replace the `useClass` with an adapter over that module's API.
    //   DEPARTURE_SOURCE: Booking lists bookings by departure time (for reminders).
    //   EMAIL_DIRECTORY:  Users and Access looks up a user's email address (for email).
    { provide: DEPARTURE_SOURCE, useClass: NoDepartureSource },
    { provide: EMAIL_DIRECTORY, useClass: NoEmailDirectory },
  ],
  exports: [NOTIFICATIONS_API],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { DepartureReminderJob } from './departure-reminder.job';
import { DepartureReminderService } from './departure-reminder.service';
import { UsersAccessModule } from '../users-access/index';
import { DEPARTURE_SOURCE } from './departure-source';
import { DepartureTracker } from './departure-tracker';
import { TrackedDepartureEntity } from './tracked-departure.entity';
import { TrackedDepartures } from './tracked-departures';
import { EMAIL_DIRECTORY } from './email-directory';
import { UsersEmailDirectoryAdapter } from './users-email-directory.adapter';
import { EmailChannel } from './email.channel';
import { LocalMailCatcher } from './local-mail-catcher';
import { MAIL_TRANSPORT } from './mail';
import { NOTIFICATION_CHANNELS, NOTIFICATION_DISPATCHER } from './notification-channel';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { NotificationEventHandler } from './notification-event.handler';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPublisher } from './notification-publisher';
import { NotificationPrefEntity } from './notification-pref.entity';
import { NotificationEntity } from './notification.entity';
import { DEPARTURE_REMINDERS_API, NOTIFICATIONS_API, PREFERENCES_API } from './notifications-api';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { PgNotificationsRepository } from './pg-notifications.repository';
import { PgPreferencesRepository } from './pg-preferences.repository';
import { PREFERENCES_REPOSITORY } from './preferences.repository';

@Module({
  imports: [
    UsersAccessModule,
    TypeOrmModule.forFeature([NotificationEntity, NotificationPrefEntity, TrackedDepartureEntity]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    // Stores a notification once and pushes it out; the event handler and the reminder service
    // both publish through it.
    NotificationPublisher,
    // The Observer. It subscribes itself to the app's global event emitter when the module starts,
    // so no other module needs to know it exists.
    NotificationEventHandler,
    // The scheduled reminder job. ScheduleModule (in app.module.ts) finds it by its @Cron.
    DepartureReminderJob,
    DepartureReminderService,
    NotificationChannelDispatcher,
    { provide: NOTIFICATION_DISPATCHER, useExisting: NotificationChannelDispatcher },
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
    { provide: PREFERENCES_API, useExisting: NotificationPreferencesService },
    { provide: DEPARTURE_REMINDERS_API, useExisting: DepartureReminderService },
    { provide: CLOCK, useValue: systemClock },

    // Reminders read this module's own record of ticketed legs, kept from events by the tracker,
    // so Notifications calls into no domain module.
    DepartureTracker,
    { provide: DEPARTURE_SOURCE, useClass: TrackedDepartures },
    // Email addresses belong to Users and Access, which every module already uses for its guards.
    { provide: EMAIL_DIRECTORY, useClass: UsersEmailDirectoryAdapter },
  ],
  exports: [NOTIFICATIONS_API],
})
export class NotificationsModule {}

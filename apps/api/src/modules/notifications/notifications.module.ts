import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { NOTIFICATION_CHANNELS } from './notification-channel';
import { NotificationEntity } from './notification.entity';
import { NotificationEventHandler } from './notification-event.handler';
import { NOTIFICATIONS_API } from './notifications-api';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { PgNotificationsRepository } from './pg-notifications.repository';
import { SimulatedGatewayChannel } from './simulated-gateway.channel';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // The Observer. It subscribes itself to the app's global event emitter when the module starts,
    // so no other module needs to know it exists.
    NotificationEventHandler,
    NotificationChannelDispatcher,
    SimulatedGatewayChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (gateway: SimulatedGatewayChannel) => [gateway],
      inject: [SimulatedGatewayChannel],
    },
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PgNotificationsRepository },
    { provide: NOTIFICATIONS_API, useExisting: NotificationsService },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [NOTIFICATIONS_API],
})
export class NotificationsModule {}

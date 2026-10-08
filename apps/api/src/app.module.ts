import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env';
import { LoggingModule } from './config/logging.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
// Domain modules are imported only through their index.ts (enforced by dependency-cruiser).
import { AdministrationModule } from './modules/administration/index';
import { BookingModule } from './modules/booking/index';
import { FlightCatalogModule } from './modules/flight-catalog/index';
import { InventoryModule } from './modules/inventory/index';
import { NotificationsModule } from './modules/notifications/index';
import { PaymentsModule } from './modules/payments/index';
import { SearchModule } from './modules/search/index';
import { TicketingModule } from './modules/ticketing/index';
import { UsersAccessModule } from './modules/users-access/index';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests supply their own environment and must not pick up a developer's .env file.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggingModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,

    FlightCatalogModule,
    SearchModule,
    InventoryModule,
    BookingModule,
    TicketingModule,
    NotificationsModule,
    UsersAccessModule,
    AdministrationModule,
    PaymentsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}

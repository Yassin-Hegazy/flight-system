import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env';
import { LoggingModule } from './config/logging.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ErrorFilter } from './shared/error.filter';
import { fieldErrorsFrom, validationError } from './shared/errors';
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
        // Fields a DTO does not declare are dropped, never trusted: a role sent by the client is
        // ignored (US-USR-03 AC-3, US-USR-04 AC-2).
        whitelist: true,
        transform: true,
        // Invalid input is a 400 listing each bad field, in the shared error shape (NFR-ERR-01).
        exceptionFactory: (errors) => validationError(fieldErrorsFrom(errors)),
      }),
    },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}

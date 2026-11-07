import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoginAttemptEntity } from './login-attempt.entity';
import { SavedTravelerEntity } from './saved-traveler.entity';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';
import { UsersAccessController } from './users-access.controller';
import { UsersAccessService } from './users-access.service';
import { CLOCK, systemClock } from '../../shared/time';
import { Argon2PasswordHasher, PASSWORD_HASHER } from './password-hasher';
import { PgUsersRepository } from './pg-users.repository';
import { USERS_API } from './users-api';
import { USERS_REPOSITORY } from './users.repository';
import { CsrfMiddleware, PrincipalMiddleware } from './principal.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SessionEntity, LoginAttemptEntity, SavedTravelerEntity]),
  ],
  controllers: [UsersAccessController],
  providers: [
    UsersAccessService,
    { provide: USERS_REPOSITORY, useClass: PgUsersRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USERS_API, useExisting: UsersAccessService },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [USERS_API],
})
export class UsersAccessModule implements NestModule {
  /** Every request passes the CSRF check and learns who is signed in before any route runs. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware, PrincipalMiddleware).forRoutes('*');
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoginAttemptEntity } from './login-attempt.entity';
import { SavedTravelerEntity } from './saved-traveler.entity';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';
import { UsersAccessController } from './users-access.controller';
import { UsersAccessService } from './users-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, SessionEntity, LoginAttemptEntity, SavedTravelerEntity])],
  controllers: [UsersAccessController],
  providers: [UsersAccessService],
  exports: [UsersAccessService],
})
export class UsersAccessModule {}

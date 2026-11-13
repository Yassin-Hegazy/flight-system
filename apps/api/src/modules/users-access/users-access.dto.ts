import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { isLocalDate } from '../../shared/time';
import { passwordProblem } from './users-access.domain';

/**
 * Field validation lives here, once, at the HTTP boundary (S1 section 6.1). The password rule is the
 * domain's own function, so the DTO and the use case can never disagree about it.
 */
function IsAcceptablePassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isAcceptablePassword',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && passwordProblem(value) === null,
        defaultMessage: (args) =>
          (typeof args?.value === 'string' && passwordProblem(args.value)) ||
          'Password must be a string',
      },
    });
  };
}

/** A real calendar date (YYYY-MM-DD) that is not in the future and not before 1900. */
function IsBirthDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isBirthDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a past date written as YYYY-MM-DD', ...options },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          isLocalDate(value) &&
          value >= '1900-01-01' &&
          value <= new Date().toISOString().slice(0, 10),
      },
    });
  };
}

const PHONE = /^[+0-9 ()-]{7,30}$/;

export class RegisterInput {
  @ApiProperty({ example: 'nour.hassan@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Correct-Horse-2026',
    description: 'At least 10 characters, at most 72 bytes.',
  })
  @IsAcceptablePassword()
  password!: string;

  @ApiProperty({ example: 'Nour Hassan', minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({
    example: '+20 100 000 0000',
    description: '7 to 30 digits, spaces, +, - or brackets.',
  })
  @IsOptional()
  @Matches(PHONE, { message: 'phone must be 7 to 30 digits, spaces, +, - or brackets' })
  phone?: string;
}

export class SignInInput {
  @ApiProperty({ example: 'traveler@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Traveler-Local-2026!' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class ProfileInput {
  @ApiPropertyOptional({ example: 'Nour M. Hassan', minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ example: '+20 100 000 0001' })
  @IsOptional()
  @Matches(PHONE, { message: 'phone must be 7 to 30 digits, spaces, +, - or brackets' })
  phone?: string;

  @ApiPropertyOptional({ example: 'nour.new@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Required when changing the email (US-USR-02 AC-1). */
  @ApiPropertyOptional({ description: 'Required when changing the email.' })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class ChangePasswordInput {
  @ApiProperty({ example: 'Correct-Horse-2026' })
  @IsString()
  @MinLength(1)
  current!: string;

  @ApiProperty({
    example: 'Correct-Horse-2027',
    description: 'At least 10 characters, at most 72 bytes.',
  })
  @IsAcceptablePassword()
  next!: string;
}

/** The same name and date-of-birth rules a booking passenger has (US-USR-06 AC-2). */
export class SavedTravelerInput {
  @ApiProperty({ example: 'Omar Hassan', minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: '2015-06-01', description: 'A past date written as YYYY-MM-DD.' })
  @IsBirthDate()
  dateOfBirth!: string;
}

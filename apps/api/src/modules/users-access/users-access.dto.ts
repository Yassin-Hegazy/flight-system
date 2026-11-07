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
  @IsEmail()
  email!: string;

  @IsAcceptablePassword()
  password!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @Matches(PHONE, { message: 'phone must be 7 to 30 digits, spaces, +, - or brackets' })
  phone?: string;
}

export class SignInInput {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ProfileInput {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Matches(PHONE, { message: 'phone must be 7 to 30 digits, spaces, +, - or brackets' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Required when changing the email (US-USR-02 AC-1). */
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class ChangePasswordInput {
  @IsString()
  @MinLength(1)
  current!: string;

  @IsAcceptablePassword()
  next!: string;
}

/** The same name and date-of-birth rules a booking passenger has (US-USR-06 AC-2). */
export class SavedTravelerInput {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsBirthDate()
  dateOfBirth!: string;
}

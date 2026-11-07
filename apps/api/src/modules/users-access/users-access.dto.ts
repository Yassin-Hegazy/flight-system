import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterInput {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(10, 72)
  password!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @Matches(/^[+0-9 ()-]{7,30}$/)
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
  @Matches(/^[+0-9 ()-]{7,30}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class ChangePasswordInput {
  @IsString()
  @MinLength(1)
  current!: string;

  @IsString()
  @Length(10, 72)
  next!: string;
}

export class SavedTravelerInput {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsDateString()
  dateOfBirth!: string;
}

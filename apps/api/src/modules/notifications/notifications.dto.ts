import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class InboxQuery {
  /** 1-based page number; defaults to the first page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;
}

export class PreferenceBody {
  /** true to also receive this type by email; false to stop. */
  @IsBoolean()
  email!: boolean;
}

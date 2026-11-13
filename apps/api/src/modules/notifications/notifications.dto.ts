import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class InboxQuery {
  /** 1-based page number; defaults to the first page. */
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;
}

export class PreferenceBody {
  /** true to also receive this type by email; false to stop. */
  @ApiProperty({ example: true, description: 'true to also receive this type by email.' })
  @IsBoolean()
  email!: boolean;
}

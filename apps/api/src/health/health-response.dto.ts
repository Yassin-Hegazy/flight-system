import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ enum: ['connected', 'disconnected'] })
  database!: 'connected' | 'disconnected';
}

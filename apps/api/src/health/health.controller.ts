import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { HealthResponseDto } from './health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Check that the API is up and can reach its database' })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: 'Always 200; database says whether it answered.',
  })
  async check(): Promise<HealthResponseDto> {
    const connected = await this.isDatabaseConnected();
    return { status: 'ok', database: connected ? 'connected' : 'disconnected' };
  }

  private async isDatabaseConnected(): Promise<boolean> {
    if (!this.dataSource.isInitialized) {
      return false;
    }
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

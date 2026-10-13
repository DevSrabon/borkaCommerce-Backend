import {
  Controller,
  Get,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { LoggerService } from './logger.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/logs')
@UseGuards(AdminGuard)
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get()
  async getLogs(
    @Query('search') search?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
    @Query('level') level?: string,
    @Query('min_duration') minDuration?: string,
    @Query('most_expensive') mostExpensive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loggerService.getLogs({
      search,
      method,
      statusCode: status ? parseInt(status, 10) : undefined,
      level,
      minDuration: minDuration ? parseFloat(minDuration) : undefined,
      mostExpensive: mostExpensive === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('stats')
  async getLogStats() {
    return this.loggerService.getLogStats();
  }

  @Delete()
  async clearLogs() {
    return this.loggerService.clearLogs();
  }
}

import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  UseGuards,
  NotFoundException,
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
    @Query('status_group') statusGroup?: string,
    @Query('level') level?: string,
    @Query('min_duration') minDuration?: string,
    @Query('sort') sort?: string,
    @Query('most_expensive') mostExpensive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loggerService.getLogs({
      search,
      method,
      statusCode: status ? parseInt(status, 10) : undefined,
      statusGroup,
      level,
      minDuration: minDuration ? parseFloat(minDuration) : undefined,
      sort,
      mostExpensive: mostExpensive === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('stats')
  async getLogStats() {
    return this.loggerService.getLogStats();
  }

  @Get(':id')
  async getLogById(@Param('id') id: string) {
    const log = await this.loggerService.getLogById(id);
    if (!log) {
      throw new NotFoundException(`Log entry with ID ${id} not found`);
    }
    return log;
  }

  @Delete()
  async clearLogs() {
    return this.loggerService.clearLogs();
  }
}


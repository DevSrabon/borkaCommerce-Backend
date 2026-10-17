import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { LoggerService } from './logger.service';
import { MailService } from '../mail/mail.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/logs')
@UseGuards(AdminGuard)
export class LoggerController {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly mailService: MailService,
  ) {}

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

  // --- ENTERPRISE AUDIT TRAIL LOGS (POST, UPDATE, DELETE with Payloads) ---
  @Get('audit')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('method') method?: string,
    @Query('entity') entity?: string,
    @Query('search') search?: string,
  ) {
    return this.loggerService.getAuditLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      action,
      method,
      entity,
      search,
    });
  }

  @Delete('audit')
  async clearAuditLogs() {
    return this.loggerService.clearAuditLogs();
  }

  @Get('audit/:id')
  async getAuditLogById(@Param('id') id: string) {
    const item = await this.loggerService.getAuditLogById(id);
    if (!item) {
      throw new NotFoundException(`Audit log entry ${id} not found`);
    }
    return item;
  }

  // --- SEPARATE EMAIL DISPATCH LOGS WITH RETRY ---
  @Get('emails')
  async getEmailLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.mailService.getEmailLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      status,
      search,
    });
  }

  @Post('emails/:id/retry')
  async retryEmail(@Param('id') id: string) {
    return this.mailService.retryEmail(id);
  }

  @Delete('emails')
  async clearEmailLogs() {
    return this.mailService.clearEmailLogs();
  }

  // --- STRIPE API & PAYMENT EVENT LOGS ---
  @Get('stripe')
  async getStripeLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('event_type') eventType?: string,
    @Query('search') search?: string,
  ) {
    return this.loggerService.getStripeLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      status,
      eventType,
      search,
    });
  }

  @Delete('stripe')
  async clearStripeLogs() {
    return this.loggerService.clearStripeLogs();
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


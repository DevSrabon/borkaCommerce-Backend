import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('analytics/visit')
  async trackVisit(
    @Body() body: { visitor_id?: string; page_url?: string },
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    const userAgent = req.headers['user-agent'] || '';

    return this.analyticsService.trackVisit({
      visitor_id: body.visitor_id,
      page_url: body.page_url,
      ip_address: ip,
      user_agent: userAgent,
    });
  }

  @UseGuards(AdminGuard)
  @Get('admin/analytics/visitors')
  async getVisitorStats() {
    return this.analyticsService.getVisitorStats();
  }
}

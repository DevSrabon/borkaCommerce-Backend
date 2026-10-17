import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ModuleRef } from '@nestjs/core';
import { SiteSettingsService } from './site-settings.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { AdminGuard } from '../auth/admin.guard';

// ─── Public Storefront ─────────────────────────────────────────────────────

@Controller('ecommerce')
export class StorefrontSiteController {
  constructor(private readonly svc: SiteSettingsService) {}

  @Get('banners')
  getActiveBanners(@Query('size_type') sizeType?: string) {
    return this.svc.getActiveBanners(sizeType);
  }

  @Get('site-settings')
  getSettings() {
    return this.svc.getPublicSettings();
  }

  @Get('shipping-calculator')
  calculateShipping(@Query('subtotal') subtotalStr?: string) {
    const subtotal = parseFloat(subtotalStr || '0') || 0;
    return this.svc.calculateDeliveryCharge(subtotal);
  }

  @Post('translate')
  async translate(@Body() body: { text?: string; texts?: string[]; sl?: string; tl?: string }) {
    const sl = body.sl || 'en';
    const tl = body.tl || 'ar';
    if (body.texts && Array.isArray(body.texts)) {
      const translations = await this.svc.translateBatchWithGoogle(body.texts, sl, tl);
      return { translations };
    }
    const text = body.text || '';
    const translatedText = await this.svc.translateWithGoogle(text, sl, tl);
    return { translatedText };
  }

  @Get('translate')
  async translateGet(
    @Query('q') q?: string,
    @Query('sl') sl?: string,
    @Query('tl') tl?: string,
  ) {
    const translatedText = await this.svc.translateWithGoogle(q || '', sl || 'en', tl || 'ar');
    return { translatedText };
  }
}

// ─── Admin ─────────────────────────────────────────────────────────────────

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminSiteController {
  constructor(
    private readonly svc: SiteSettingsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // Banners
  @Get('banners')
  async getAllBanners(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.svc.getAllBanners(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @Post('banners')
  createBanner(
    @Body()
    dto: {
      title: string;
      subtitle?: string;
      cta_text?: string;
      cta_link?: string;
      image_url: string;
      mobile_image_url?: string;
      alt_text?: string;
      size_type?: string;
      size_description?: string;
      is_active?: boolean;
      sort_order?: number;
    },
  ) {
    return this.svc.createBanner(dto);
  }

  @Patch('banners/:id')
  updateBanner(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      title: string;
      subtitle: string;
      cta_text: string;
      cta_link: string;
      image_url: string;
      mobile_image_url: string;
      alt_text: string;
      size_type: string;
      size_description: string;
      is_active: boolean;
      sort_order: number;
    }>,
  ) {
    return this.svc.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.svc.deleteBanner(id);
  }

  // Site Settings
  @Get('site-settings')
  getSettings() {
    return this.svc.getAllSettings();
  }

  @Patch('site-settings')
  async updateSettings(@Body() dto: Record<string, string>) {
    const updated = await this.svc.upsertSettings(dto);
    if ('REDIS_ENABLED' in dto || 'REDIS_URL' in dto) {
      try {
        const redisService = this.moduleRef.get(RedisService, { strict: false });
        if (redisService) {
          await redisService.initClient();
        }
      } catch (_) {}
    }
    return updated;
  }

  // Dynamic Redis endpoints
  @Get('redis/status')
  async getRedisStatus() {
    try {
      const redisService = this.moduleRef.get(RedisService, { strict: false });
      if (redisService) return await redisService.getStatus();
    } catch (_) {}
    return { enabled: false, connected: false, healthy: false };
  }

  @Post('redis/test')
  async testRedis(@Body() body: { url?: string }) {
    try {
      const redisService = this.moduleRef.get(RedisService, { strict: false });
      if (redisService) return await redisService.testConnection(body?.url);
    } catch (err: any) {
      return { success: false, message: err.message };
    }
    return { success: false, message: 'Redis service not available' };
  }

  // SMTP Mail Server Test & Verification
  @Post('settings/test-smtp')
  async testSmtp(
    @Body()
    body?: {
      host?: string;
      port?: number | string;
      user?: string;
      pass?: string;
      secure?: boolean | string;
    },
  ) {
    try {
      const mailService = this.moduleRef.get(MailService, { strict: false });
      if (mailService) {
        return await mailService.verifySmtp(body);
      }
      return { success: false, message: 'MailService not available' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // Currency Exchange Rate Synchronization
  @Post('currency/sync-rates')
  async syncExchangeRates() {
    return this.svc.syncExchangeRates();
  }

  // Cache Clear
  @Post('cache/clear')
  async clearCache() {
    const details = await this.svc.clearAllCaches();
    return {
      success: true,
      message: 'All backend memory, translation, and system caches have been purged successfully.',
      details,
    };
  }
}

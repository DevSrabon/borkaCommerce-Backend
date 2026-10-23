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
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ModuleRef } from '@nestjs/core';
import { SiteSettingsService } from './site-settings.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { AdminGuard, isSuperAdminUser } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';

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
  async getSettings(@CurrentUser() user: any) {
    const settings = await this.svc.getAllSettings();
    // Only SUPER_ADMIN can view Stripe credentials
    if (!isSuperAdminUser(user)) {
      delete settings.STRIPE_SECRET_KEY;
      delete settings.STRIPE_PUBLISHABLE_KEY;
      delete settings.STRIPE_WEBHOOK_SECRET;
    }
    return settings;
  }

  @Patch('site-settings')
  async updateSettings(@Body() dto: Record<string, string>, @CurrentUser() user: any) {
    // Only SUPER_ADMIN can modify Stripe configuration
    const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'stripe_mode'];
    const hasStripeUpdate = Object.keys(dto).some(
      (k) => stripeKeys.includes(k) || k.toUpperCase().includes('STRIPE'),
    );

    if (hasStripeUpdate && !isSuperAdminUser(user)) {
      throw new ForbiddenException(
        'Super Admin privilege required: Only a SUPER_ADMIN can view or update Stripe payment gateway settings.',
      );
    }

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

  // Cache Clear & System Revalidation
  @Post('cache/clear')
  async clearCache() {
    const details = await this.svc.clearAllCaches();

    let redisKeysPurged = 0;
    try {
      const redisService = this.moduleRef.get(RedisService, { strict: false });
      if (redisService && redisService.isAvailable()) {
        const client = redisService.getClient();
        if (client) {
          const keys = await client.keys('borka:*');
          if (keys && keys.length > 0) {
            await client.del(...keys);
            redisKeysPurged = keys.length;
          }
        }
      }
    } catch (_) {}

    // Trigger Next.js revalidation from backend if frontend server is reachable
    let nextjsRevalidated = false;
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const revalRes = await fetch(`${frontendUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      nextjsRevalidated = revalRes.ok;
    } catch (_) {}

    return {
      success: true,
      message: 'All backend memory, Redis keys, translation caches, and website pages have been revalidated successfully.',
      details: {
        ...details,
        redisKeysPurged,
        nextjsRevalidated,
      },
    };
  }
}

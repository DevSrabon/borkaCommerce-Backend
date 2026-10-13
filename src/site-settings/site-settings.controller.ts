import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
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
    return this.svc.getAllSettings();
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
  constructor(private readonly svc: SiteSettingsService) {}

  // Banners
  @Get('banners')
  getAllBanners() {
    return this.svc.getAllBanners();
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
  updateSettings(@Body() dto: Record<string, string>) {
    return this.svc.upsertSettings(dto);
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

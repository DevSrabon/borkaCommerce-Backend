import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';

// ─── Public Storefront ─────────────────────────────────────────────────────

@Controller('ecommerce')
export class StorefrontSiteController {
  constructor(private readonly svc: SiteSettingsService) {}

  @Get('banners')
  getActiveBanners() {
    return this.svc.getActiveBanners();
  }

  @Get('site-settings')
  getSettings() {
    return this.svc.getAllSettings();
  }
}

// ─── Admin ─────────────────────────────────────────────────────────────────

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
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
  @Patch('site-settings')
  updateSettings(@Body() dto: Record<string, string>) {
    return this.svc.upsertSettings(dto);
  }
}

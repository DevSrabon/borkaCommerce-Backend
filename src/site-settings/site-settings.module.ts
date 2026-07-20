import { Module } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { StorefrontSiteController, AdminSiteController } from './site-settings.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StorefrontSiteController, AdminSiteController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}

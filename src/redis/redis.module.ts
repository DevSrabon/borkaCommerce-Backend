import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Global()
@Module({
  imports: [SiteSettingsModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

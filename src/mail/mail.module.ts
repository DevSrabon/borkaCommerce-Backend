import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

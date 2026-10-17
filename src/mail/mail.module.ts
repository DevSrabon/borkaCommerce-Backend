import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

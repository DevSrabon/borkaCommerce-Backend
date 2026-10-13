import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminCustomersController } from './admin-customers.controller';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [AuthController, AdminCustomersController],
  providers: [AuthService, AuthGuard, AdminGuard],
  exports: [AuthGuard, AdminGuard, AuthService],
})
export class AuthModule {}

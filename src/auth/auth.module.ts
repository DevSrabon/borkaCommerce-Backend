import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard],
  exports: [AuthGuard, AdminGuard, AuthService],
})
export class AuthModule {}

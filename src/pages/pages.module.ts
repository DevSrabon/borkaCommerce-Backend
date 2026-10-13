import { Module } from '@nestjs/common';
import { PagesService } from './pages.service';
import {
  StorefrontPagesController,
  AdminPagesController,
} from './pages.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StorefrontPagesController, AdminPagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}

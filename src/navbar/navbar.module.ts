import { Module } from '@nestjs/common';
import { NavbarService } from './navbar.service';
import { StorefrontNavbarController, AdminNavbarController } from './navbar.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StorefrontNavbarController, AdminNavbarController],
  providers: [NavbarService],
  exports: [NavbarService],
})
export class NavbarModule {}

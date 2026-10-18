import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NavbarService } from './navbar.service';
import { AdminGuard } from '../auth/admin.guard';

// ─── Storefront Public Endpoint ─────────────────────────────────────────────
@Controller('ecommerce/navbar')
export class StorefrontNavbarController {
  constructor(private readonly svc: NavbarService) {}

  @Get()
  async getStorefrontNavbar() {
    return this.svc.getStorefrontNavbar();
  }
}

// ─── Admin Management Endpoints ─────────────────────────────────────────────
@Controller('admin/navbar')
@UseGuards(AdminGuard)
export class AdminNavbarController {
  constructor(private readonly svc: NavbarService) {}

  @Get()
  async findAll() {
    return this.svc.findAll();
  }

  @Post()
  async create(
    @Body()
    dto: {
      name: string;
      type: 'ALL_CATEGORIES' | 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCTS' | 'OFFER' | 'CUSTOM';
      category_id?: string;
      subcategory_id?: string;
      link?: string;
      description?: string;
      badge?: string;
      icon?: string;
      sort_order?: number;
      is_active?: boolean;
      custom_data?: any;
    }
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Post('reorder')
  async reorder(@Body() body: { items: { id: string; sort_order: number }[] }) {
    return this.svc.reorder(body.items || []);
  }

  @Post('seed-defaults')
  async seedDefaults() {
    return this.svc.seedDefaults();
  }
}

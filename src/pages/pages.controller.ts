import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PagesService } from './pages.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';
import { AdminGuard } from '../auth/admin.guard';

// ─── Public Storefront Controller ──────────────────────────────────────────

@Controller('ecommerce/pages')
export class StorefrontPagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  async getPublishedPages() {
    return this.pagesService.getPublishedPages();
  }

  @Get(':slug')
  async getPageBySlug(@Param('slug') slug: string) {
    return this.pagesService.getPublishedBySlug(slug);
  }
}

// ─── Admin Controller ──────────────────────────────────────────────────────

@Controller('admin/pages')
@UseGuards(AdminGuard)
export class AdminPagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  async getAllPages(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.pagesService.getAllPages(search, limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @Get(':id')
  async getPageById(@Param('id') id: string) {
    return this.pagesService.getPageById(id);
  }

  @Post()
  async createPage(@Body() dto: CreatePageDto) {
    return this.pagesService.createPage(dto);
  }

  @Patch(':id')
  async updatePage(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.pagesService.updatePage(id, dto);
  }

  @Delete(':id')
  async deletePage(@Param('id') id: string) {
    return this.pagesService.deletePage(id);
  }
}

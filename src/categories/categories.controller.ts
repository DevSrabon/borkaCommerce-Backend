import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // --- ADMIN ROUTES ---

  @UseGuards(AdminGuard)
  @Post('admin/categories')
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/categories')
  async findAllAdmin(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.categoriesService.findAll(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Get('admin/categories/tree')
  getTreeAdmin() {
    return this.categoriesService.getTree();
  }

  @UseGuards(AdminGuard)
  @Get('admin/categories/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/categories/:id')
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/categories/:id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/categories/reorder')
  reorder(@Body() body: { items: { id: string; sort_order: number }[] }) {
    return this.categoriesService.reorder(body.items);
  }

  // --- STOREFRONT (ECOMMERCE) ROUTES ---

  @Get('ecommerce/categories')
  findAllStorefront() {
    return this.categoriesService.findAllActive();
  }

  @Get('ecommerce/categories/tree')
  getTreeStorefront() {
    return this.categoriesService.getStorefrontTree();
  }

  @Get('ecommerce/categories/:id')
  findOneStorefront(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }
}

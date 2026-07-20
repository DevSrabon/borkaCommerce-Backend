import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
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
  findAllAdmin() {
    return this.categoriesService.findAll();
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

  // --- STOREFRONT (ECOMMERCE) ROUTES ---

  @Get('ecommerce/categories/tree')
  async getTreeStorefront() {
    // Return only active categories for storefront
    const tree = await this.categoriesService.getTree();
    
    // Helper function to filter out inactive categories recursively
    const filterActive = (nodes: any[]): any[] => {
      return nodes
        .filter((node) => node.is_active)
        .map((node) => ({
          ...node,
          children: filterActive(node.children || []),
        }));
    };

    return filterActive(tree);
  }

  @Get('ecommerce/categories/:id')
  findOneStorefront(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }
}

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { AdminGuard } from '../auth/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // --- ADMIN ROUTES ---

  @UseGuards(AdminGuard)
  @Post('admin/products/upload')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const folder = join(process.cwd(), 'uploads', 'product');
          if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
          callback(null, folder);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  uploadProductImage(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Store the relative path in DB: /product/filename.ext
    const relativePath = `/product/${file.filename}`;
    return {
      imageUrl: `http://localhost:8080/uploads${relativePath}`,
      imagePath: relativePath,
    };
  }

  @UseGuards(AdminGuard)
  @Get('admin/attributes')
  findAllAttributes() {
    return this.productsService.findAllAttributes();
  }

  @UseGuards(AdminGuard)
  @Post('admin/attributes')
  createAttribute(@Body() body: { name: string }) {
    if (!body.name) {
      throw new BadRequestException('Attribute name is required');
    }
    return this.productsService.createAttribute(body.name);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/attributes/:id')
  updateAttribute(@Param('id') id: string, @Body() body: { name: string }) {
    if (!body.name) {
      throw new BadRequestException('Attribute name is required');
    }
    return this.productsService.updateAttribute(id, body.name);
  }

  @UseGuards(AdminGuard)
  @Post('admin/attributes/:id/values')
  createAttributeValue(@Param('id') id: string, @Body() body: { value: string }) {
    if (!body.value) {
      throw new BadRequestException('Attribute value is required');
    }
    return this.productsService.createAttributeValue(id, body.value);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/attributes/values/:valueId')
  updateAttributeValue(@Param('valueId') valueId: string, @Body() body: { value: string }) {
    if (!body.value) {
      throw new BadRequestException('Attribute value is required');
    }
    return this.productsService.updateAttributeValue(valueId, body.value);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/attributes/:id')
  removeAttribute(@Param('id') id: string) {
    return this.productsService.removeAttribute(id);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/attributes/values/:valueId')
  removeAttributeValue(@Param('valueId') valueId: string) {
    return this.productsService.removeAttributeValue(valueId);
  }

  @UseGuards(AdminGuard)
  @Post('admin/products')
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/products')
  findAllAdmin() {
    return this.productsService.findAllAdmin();
  }

  @UseGuards(AdminGuard)
  @Get('admin/products/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/products/:id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/products/:id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  // --- STOREFRONT ROUTES ---

  @Get('ecommerce/products')
  findAllStorefront(
    @Query('category_id') categoryId?: string,
    @Query('is_featured') isFeatured?: string,
    @Query('search') search?: string,
  ) {
    const featured = isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined;
    return this.productsService.findAllStorefront(categoryId, featured, search);
  }

  @Get('ecommerce/products/slug/:slug')
  findOneStorefront(@Param('slug') slug: string) {
    return this.productsService.findOneStorefront(slug);
  }
}

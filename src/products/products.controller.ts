import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { AdminGuard } from '../auth/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadMiddleware, uploadFolders } from '../uploads/image-upload.middleware';
import { UploadFilesService } from '../uploads/upload-files.service';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly uploadFilesService: UploadFilesService,
  ) {}

  // --- ADMIN ROUTES ---

  @UseGuards(AdminGuard)
  @Post('admin/products/upload')
  @UseInterceptors(
    FileInterceptor('image', { storage: imageUploadMiddleware('product') }),
  )
  uploadProductImage(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const imagePath = this.uploadFilesService.relativePath('product', file.filename);
    return {
      imageUrl: this.uploadFilesService.imageUrl(imagePath),
      imagePath,
    };
  }

  @UseGuards(AdminGuard)
  @Post('admin/uploads/:folder')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (request, _file, callback) => {
          const folder = request.params.folder;
          if (!(uploadFolders as readonly string[]).includes(folder)) {
            callback(new BadRequestException('Unsupported upload folder'), '');
            return;
          }
          const destination = join(process.cwd(), 'uploads', folder);
          fs.mkdirSync(destination, { recursive: true });
          callback(null, destination);
        },
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        },
      }),
    }),
  )
  uploadAdminImage(@Param('folder') folder: string, @UploadedFile() file: any) {
    if (!this.uploadFilesService.isSupportedFolder(folder)) {
      throw new BadRequestException('Unsupported upload folder');
    }
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const imagePath = this.uploadFilesService.relativePath(folder, file.filename);
    return {
      imageUrl: this.uploadFilesService.imageUrl(imagePath),
      imagePath,
    };
  }

  @UseGuards(AdminGuard)
  @Get('admin/attributes')
  async findAllAttributes(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.productsService.findAllAttributes(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
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
  async findAllAdmin(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.productsService.findAllAdmin(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Get('admin/products/next-number')
  async getNextProductNumber() {
    const nextNumber = await this.productsService.generateNextProductNumber();
    return { next_product_number: nextNumber };
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
  @Delete('admin/products/:productId/images/:imageId')
  removeImage(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.productsService.removeImage(productId, imageId);
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
    @Query('on_sale') onSale?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const featured = isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined;
    const saleOnly = onSale === 'true';
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.productsService.findAllStorefront(categoryId, featured, search, saleOnly, pageNum, limitNum);
  }

  @Get('ecommerce/products/slug/:slug')
  findOneStorefront(@Param('slug') slug: string) {
    return this.productsService.findOneStorefront(slug);
  }
}

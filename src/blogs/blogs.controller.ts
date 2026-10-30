import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BlogsService } from './blogs.service';
import {
  CreateBlogDto,
  UpdateBlogDto,
  CreateBlogCommentDto,
  UpdateCommentStatusDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from './dto/blogs.dto';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  // ==========================================
  // PUBLIC STOREFRONT ENDPOINTS
  // ==========================================

  @Get('blogs')
  async getAllBlogs(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: 'latest' | 'popular',
  ) {
    return this.blogsService.getAllBlogs({ search, category, sort });
  }

  @Get('blogs/latest')
  async getLatestBlogs() {
    return this.blogsService.getLatestBlogs(5);
  }

  @Get('blogs/popular')
  async getPopularBlogs() {
    return this.blogsService.getPopularBlogs(5);
  }

  @Get('blogs/categories')
  async getCategories() {
    return this.blogsService.getCategories();
  }

  @Get('blogs/:slug')
  async getBlogBySlug(@Param('slug') slug: string) {
    return this.blogsService.getBlogBySlug(slug);
  }

  @Post('blogs/:id/comments')
  async createComment(
    @Param('id') id: string,
    @Body() dto: CreateBlogCommentDto,
  ) {
    return this.blogsService.createComment(id, dto);
  }

  // ==========================================
  // ADMIN MANAGEMENT ENDPOINTS
  // ==========================================

  @Get('admin/blogs/categories')
  @UseGuards(AdminGuard)
  async adminGetCategories(@Query('raw') raw?: string) {
    if (raw === 'true') {
      return this.blogsService.getCategories();
    }
    return this.blogsService.getCategoriesWithStats();
  }

  @Post('admin/blogs/categories')
  @UseGuards(AdminGuard)
  async adminAddCategory(@Body() body: any) {
    const name = body?.name || body?.categoryName;
    return this.blogsService.addCategory(name);
  }

  @Patch('admin/blogs/categories')
  @UseGuards(AdminGuard)
  async adminUpdateCategory(@Body() body: any) {
    const oldName = body?.oldName || body?.currentName;
    const newName = body?.newName || body?.name;
    return this.blogsService.updateCategory(oldName, newName);
  }

  @Put('admin/blogs/categories/:oldName')
  @UseGuards(AdminGuard)
  async adminUpdateCategoryByParam(
    @Param('oldName') oldName: string,
    @Body('newName') newName: string,
  ) {
    return this.blogsService.updateCategory(oldName, newName);
  }

  @Delete('admin/blogs/categories/:name')
  @UseGuards(AdminGuard)
  async adminDeleteCategory(@Param('name') name: string) {
    return this.blogsService.deleteCategory(name);
  }

  @Get('admin/blogs')
  @UseGuards(AdminGuard)
  async adminGetAllBlogs(@Query('search') search?: string) {
    return this.blogsService.adminGetAllBlogs({ search });
  }

  @Post('admin/blogs')
  @UseGuards(AdminGuard)
  async adminCreateBlog(@Body() dto: CreateBlogDto) {
    return this.blogsService.adminCreateBlog(dto);
  }

  @Get('admin/blogs/comments/all')
  @UseGuards(AdminGuard)
  async adminGetAllComments(
    @Query('status') status?: string,
    @Query('blogId') blogId?: string,
  ) {
    return this.blogsService.adminGetAllComments({ status, blogId });
  }

  @Get('admin/blogs/:id')
  @UseGuards(AdminGuard)
  async adminGetBlogById(@Param('id') id: string) {
    return this.blogsService.adminGetBlogById(id);
  }

  @Patch('admin/blogs/:id')
  @UseGuards(AdminGuard)
  async adminUpdateBlog(
    @Param('id') id: string,
    @Body() dto: UpdateBlogDto,
  ) {
    return this.blogsService.adminUpdateBlog(id, dto);
  }

  @Delete('admin/blogs/:id')
  @UseGuards(AdminGuard)
  async adminDeleteBlog(@Param('id') id: string) {
    return this.blogsService.adminDeleteBlog(id);
  }

  @Patch('admin/blogs/comments/:commentId/status')
  @UseGuards(AdminGuard)
  async adminUpdateCommentStatus(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentStatusDto,
  ) {
    return this.blogsService.adminUpdateCommentStatus(commentId, dto.status);
  }

  @Delete('admin/blogs/comments/:commentId')
  @UseGuards(AdminGuard)
  async adminDeleteComment(@Param('commentId') commentId: string) {
    return this.blogsService.adminDeleteComment(commentId);
  }
}

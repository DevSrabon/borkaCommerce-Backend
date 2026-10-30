import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewStatusDto } from './dto/reviews.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { review_status } from '@prisma/client';

// ─── Storefront Review Controller ──────────────────────────────────────────

@Controller('ecommerce/reviews')
export class ReviewsStorefrontController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(AuthGuard)
  @Post()
  createReview(@CurrentUser() customer: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(customer.id, dto);
  }

  @UseGuards(AuthGuard)
  @Get('can-review/:productId')
  checkEligibility(@CurrentUser() customer: any, @Param('productId') productId: string) {
    return this.reviewsService.checkPurchaseEligibility(customer.id, productId);
  }

  @Get('product/:productId')
  getProductReviews(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviews(productId);
  }
}

// ─── Admin Review Controller ───────────────────────────────────────────────

@Controller('admin/reviews')
@UseGuards(AdminGuard)
export class ReviewsAdminController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async getAllReviews(
    @Query('page') page?: string,
    @Query('status') status?: review_status,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = 50;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : (skip ? Math.floor(Math.max(0, parseInt(skip, 10)) / limitNum) + 1 : 1);
    const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : (pageNum - 1) * limitNum;
    const { items, total } = await this.reviewsService.getAllReviewsAdmin(status, limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      skip: skipNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    };
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReviewStatusDto) {
    return this.reviewsService.updateReviewStatus(id, dto.status);
  }

  @Delete(':id')
  deleteReview(@Param('id') id: string) {
    return this.reviewsService.deleteReview(id);
  }
}

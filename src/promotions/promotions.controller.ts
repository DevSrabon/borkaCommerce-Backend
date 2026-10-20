import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PromotionsService } from './promotions.service';
import { CreateOfferDto, UpdateOfferDto, CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto/promotions.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard';

@Controller()
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  // --- ADMIN PROMOTION ROUTES ---

  @UseGuards(AdminGuard)
  @Post('admin/offers')
  createOffer(@Body() createOfferDto: CreateOfferDto) {
    return this.promotionsService.createOffer(createOfferDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/offers')
  async findAllOffers(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.promotionsService.findAllOffers(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Patch('admin/offers/:id')
  updateOffer(@Param('id') id: string, @Body() updateOfferDto: UpdateOfferDto) {
    return this.promotionsService.updateOffer(id, updateOfferDto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/offers/:id')
  deleteOffer(@Param('id') id: string) {
    return this.promotionsService.deleteOffer(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/coupons')
  createCoupon(@Body() createCouponDto: CreateCouponDto) {
    return this.promotionsService.createCoupon(createCouponDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/coupons')
  async findAllCoupons(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.promotionsService.findAllCoupons(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Patch('admin/coupons/:id')
  updateCoupon(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.promotionsService.updateCoupon(id, updateCouponDto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.promotionsService.deleteCoupon(id);
  }

  // --- STOREFRONT PROMOTION ROUTES ---
  @Get('ecommerce/promotions/active')
  findActivePromotions() {
    return this.promotionsService.findActivePromotions();
  }

  @UseGuards(OptionalAuthGuard)
  @Post('ecommerce/promotions/validate-coupon')
  validateCoupon(@Body() validateCouponDto: ValidateCouponDto, @Req() req: any) {
    // Validate coupon and pass customer's ID if authenticated to check per-customer usage limits
    return this.promotionsService.validateCoupon(validateCouponDto, req.user?.id);
  }
}

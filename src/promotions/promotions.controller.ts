import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards, Req, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PromotionsService } from './promotions.service';
import {
  CreateOfferDto,
  UpdateOfferDto,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  SendPromotionalEmailDto,
  UpdatePromoPopupDto,
} from './dto/promotions.dto';
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
    @Query('page') page?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = 50;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : (skip ? Math.floor(Math.max(0, parseInt(skip, 10)) / limitNum) + 1 : 1);
    const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : (pageNum - 1) * limitNum;
    const { items, total } = await this.promotionsService.findAllOffers(limitNum, skipNum);
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
    @Query('page') page?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = 50;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : (skip ? Math.floor(Math.max(0, parseInt(skip, 10)) / limitNum) + 1 : 1);
    const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : (pageNum - 1) * limitNum;
    const { items, total } = await this.promotionsService.findAllCoupons(limitNum, skipNum);
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

  // --- PROMOTIONAL EMAILS & POPUPS ---

  @UseGuards(AdminGuard)
  @Get('admin/promotions/recipients-count')
  getRecipientsCount() {
    return this.promotionsService.getRecipientsCount();
  }

  @UseGuards(AdminGuard)
  @Post('admin/promotions/send-email')
  sendPromotionalEmail(@Body() dto: SendPromotionalEmailDto) {
    return this.promotionsService.sendPromotionalEmail(dto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/promotions/email-history')
  getPromotionalEmailHistory() {
    return this.promotionsService.getPromotionalEmailHistory();
  }

  @UseGuards(AdminGuard)
  @Get('admin/promotions/popup')
  getPromoPopup() {
    return this.promotionsService.getPromoPopup();
  }

  @UseGuards(AdminGuard)
  @Post('admin/promotions/popup')
  updatePromoPopup(@Body() dto: UpdatePromoPopupDto) {
    return this.promotionsService.updatePromoPopup(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/promotions/popup')
  updatePromoPopupPatch(@Body() dto: UpdatePromoPopupDto) {
    return this.promotionsService.updatePromoPopup(dto);
  }

  @UseGuards(AdminGuard)
  @Put('admin/promotions/popup')
  updatePromoPopupPut(@Body() dto: UpdatePromoPopupDto) {
    return this.promotionsService.updatePromoPopup(dto);
  }

  @UseGuards(AdminGuard)
  @Post('admin/promotions/popup/reset')
  resetPopupSession() {
    return this.promotionsService.resetPopupSession();
  }

  @Get('public/promotions/popup')
  getPublicPromoPopup() {
    return this.promotionsService.getPublicPromoPopup();
  }

  @Get('ecommerce/promotions/popup')
  getEcommercePromoPopup() {
    return this.promotionsService.getPublicPromoPopup();
  }

  @Get('ecommerce/popup')
  getEcommercePopupShort() {
    return this.promotionsService.getPublicPromoPopup();
  }
}

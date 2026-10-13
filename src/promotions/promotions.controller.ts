import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreateOfferDto, CreateCouponDto, ValidateCouponDto } from './dto/promotions.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';

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
  findAllOffers() {
    return this.promotionsService.findAllOffers();
  }

  @UseGuards(AdminGuard)
  @Post('admin/coupons')
  createCoupon(@Body() createCouponDto: CreateCouponDto) {
    return this.promotionsService.createCoupon(createCouponDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/coupons')
  findAllCoupons() {
    return this.promotionsService.findAllCoupons();
  }

  // --- STOREFRONT PROMOTION ROUTES ---
  @Get('ecommerce/promotions/active')
  findActivePromotions() {
    return this.promotionsService.findActivePromotions();
  }

  @UseGuards(AuthGuard)
  @Post('ecommerce/promotions/validate-coupon')
  validateCoupon(@Body() validateCouponDto: ValidateCouponDto, @Req() req: any) {
    // Validate coupon and pass current customer's ID to check usage limits
    return this.promotionsService.validateCoupon(validateCouponDto, req.user?.id);
  }
}

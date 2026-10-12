import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOfferDto, CreateCouponDto, ValidateCouponDto } from './dto/promotions.dto';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  // --- OFFERS LOGIC ---

  async createOffer(dto: CreateOfferDto) {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offers.create({
        data: {
          name: dto.name,
          type: dto.type,
          priority: dto.priority,
          discount_type: dto.discount_type,
          discount_value: dto.discount_value,
          start_date: dto.start_date,
          end_date: dto.end_date,
          status: dto.status,
        },
      });

      if (dto.variant_ids && dto.variant_ids.length > 0) {
        // Confirm variants exist
        const variants = await tx.product_variants.findMany({
          where: { id: { in: dto.variant_ids } },
        });
        if (variants.length !== dto.variant_ids.length) {
          throw new NotFoundException('One or more variant IDs are invalid');
        }

        await tx.offer_products.createMany({
          data: dto.variant_ids.map((vId) => ({
            offer_id: offer.id,
            variant_id: vId,
          })),
        });
      }

      if (dto.category_ids && dto.category_ids.length > 0) {
        // Confirm categories exist
        const categories = await tx.categories.findMany({
          where: { id: { in: dto.category_ids } },
        });
        if (categories.length !== dto.category_ids.length) {
          throw new NotFoundException('One or more category IDs are invalid');
        }

        await tx.offer_categories.createMany({
          data: dto.category_ids.map((cId) => ({
            offer_id: offer.id,
            category_id: cId,
          })),
        });
      }

      return offer;
    });
  }

  async findAllOffers() {
    return this.prisma.offers.findMany({
      include: {
        products: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
        categories: {
          include: { category: true },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  // --- COUPONS LOGIC ---

  async createCoupon(dto: CreateCouponDto) {
    const existing = await this.prisma.coupons.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    return this.prisma.coupons.create({
      data: {
        ...dto,
        code: dto.code.toUpperCase(),
      },
    });
  }

  async findAllCoupons() {
    return this.prisma.coupons.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async validateCoupon(dto: ValidateCouponDto, customerId?: string) {
    const code = dto.code.toUpperCase();
    const coupon = await this.prisma.coupons.findUnique({
      where: { code },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon code '${code}' not found`);
    }

    if (!coupon.status) {
      throw new BadRequestException('Coupon is disabled');
    }

    const now = new Date();
    if (new Date(coupon.start_date) > now || new Date(coupon.end_date) < now) {
      throw new BadRequestException('Coupon has expired or is not active yet');
    }

    // Check coupon global limits
    if (coupon.usage_limit !== null) {
      const usages = await this.prisma.orders.count({
        where: { coupon_id: coupon.id, status: { not: 'CANCELLED' } },
      });
      if (usages >= coupon.usage_limit) {
        throw new BadRequestException('Coupon usage limit reached');
      }
    }

    // Check customer-specific usage limits
    if (customerId && coupon.usage_per_customer) {
      const usages = await this.prisma.orders.count({
        where: {
          coupon_id: coupon.id,
          customer_id: customerId,
          status: { not: 'CANCELLED' },
        },
      });
      if (usages >= coupon.usage_per_customer) {
        throw new BadRequestException('You have already redeemed this coupon the maximum number of times');
      }
    }

    // Verify minimum order amount
    if (coupon.minimum_amount && dto.order_subtotal < Number(coupon.minimum_amount)) {
      throw new BadRequestException(`Minimum purchase subtotal of AED ${coupon.minimum_amount} is required`);
    }

    // Calculate actual discount
    let discountAmount = 0;
    if (coupon.discount_type === 'PERCENTAGE') {
      discountAmount = dto.order_subtotal * (Number(coupon.discount_value) / 100);
      if (coupon.maximum_discount && discountAmount > Number(coupon.maximum_discount)) {
        discountAmount = Number(coupon.maximum_discount);
      }
    } else {
      discountAmount = Number(coupon.discount_value);
    }

    // Cap the discount at the order subtotal
    discountAmount = Math.min(discountAmount, dto.order_subtotal);

    return {
      coupon_id: coupon.id,
      code: coupon.code,
      discount_amount: Number(discountAmount.toFixed(2)),
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      minimum_amount: coupon.minimum_amount ? Number(coupon.minimum_amount) : null,
    };
  }
}

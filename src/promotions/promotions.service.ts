import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOfferDto, UpdateOfferDto, CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto/promotions.dto';

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

      // If specific products are selected, resolve all their variants
      let finalVariantIds = [...(dto.variant_ids || [])];
      if (dto.product_ids && dto.product_ids.length > 0 && dto.apply_to !== 'ALL') {
        const prodVariants = await tx.product_variants.findMany({
          where: { product_id: { in: dto.product_ids } },
          select: { id: true },
        });
        finalVariantIds = Array.from(new Set([...finalVariantIds, ...prodVariants.map((v) => v.id)]));
      }

      if (dto.apply_to !== 'ALL' && finalVariantIds.length > 0) {
        // Confirm variants exist
        const variants = await tx.product_variants.findMany({
          where: { id: { in: finalVariantIds } },
        });

        await tx.offer_products.createMany({
          data: variants.map((v) => ({
            offer_id: offer.id,
            variant_id: v.id,
          })),
        });
      }

      if (dto.apply_to !== 'ALL' && dto.category_ids && dto.category_ids.length > 0) {
        const categories = await tx.categories.findMany({
          where: { id: { in: dto.category_ids } },
        });

        await tx.offer_categories.createMany({
          data: categories.map((c) => ({
            offer_id: offer.id,
            category_id: c.id,
          })),
        });
      }

      return offer;
    });
  }

  async updateOffer(id: string, dto: UpdateOfferDto) {
    const existing = await this.prisma.offers.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Offer #${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.type !== undefined) updateData.type = dto.type;
      if (dto.priority !== undefined) updateData.priority = dto.priority;
      if (dto.discount_type !== undefined) updateData.discount_type = dto.discount_type;
      if (dto.discount_value !== undefined) updateData.discount_value = dto.discount_value;
      if (dto.start_date !== undefined) updateData.start_date = dto.start_date;
      if (dto.end_date !== undefined) updateData.end_date = dto.end_date;
      if (dto.status !== undefined) updateData.status = dto.status;

      const offer = await tx.offers.update({
        where: { id },
        data: updateData,
      });

      if (dto.apply_to === 'ALL') {
        // Clear all linked specific products and categories
        await tx.offer_products.deleteMany({ where: { offer_id: id } });
        await tx.offer_categories.deleteMany({ where: { offer_id: id } });
      } else {
        // If product_ids or variant_ids provided
        if (dto.product_ids !== undefined || dto.variant_ids !== undefined) {
          let finalVariantIds = [...(dto.variant_ids || [])];
          if (dto.product_ids && dto.product_ids.length > 0) {
            const prodVariants = await tx.product_variants.findMany({
              where: { product_id: { in: dto.product_ids } },
              select: { id: true },
            });
            finalVariantIds = Array.from(new Set([...finalVariantIds, ...prodVariants.map((v) => v.id)]));
          }

          await tx.offer_products.deleteMany({ where: { offer_id: id } });
          if (finalVariantIds.length > 0) {
            await tx.offer_products.createMany({
              data: finalVariantIds.map((vId) => ({
                offer_id: id,
                variant_id: vId,
              })),
            });
          }
        }

        // If category_ids provided
        if (dto.category_ids !== undefined) {
          await tx.offer_categories.deleteMany({ where: { offer_id: id } });
          if (dto.category_ids.length > 0) {
            await tx.offer_categories.createMany({
              data: dto.category_ids.map((cId) => ({
                offer_id: id,
                category_id: cId,
              })),
            });
          }
        }
      }

      return offer;
    });
  }

  async deleteOffer(id: string) {
    const existing = await this.prisma.offers.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Offer #${id} not found`);
    }

    await this.prisma.offers.delete({ where: { id } });
    return { success: true, message: `Offer "${existing.name}" deleted successfully` };
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

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupons.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Coupon #${id} not found`);
    }

    const data: any = { ...dto };
    if (dto.code) {
      data.code = dto.code.toUpperCase();
    }

    return this.prisma.coupons.update({
      where: { id },
      data,
    });
  }

  async deleteCoupon(id: string) {
    const existing = await this.prisma.coupons.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Coupon #${id} not found`);
    }

    await this.prisma.coupons.delete({ where: { id } });
    return { success: true, message: `Coupon "${existing.code}" deleted successfully` };
  }

  async findAllCoupons() {
    return this.prisma.coupons.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findActivePromotions() {
    const now = new Date();
    const [offers, coupons] = await Promise.all([
      this.prisma.offers.findMany({
        where: {
          status: 'ACTIVE',
          start_date: { lte: now },
          end_date: { gte: now },
        },
        include: {
          categories: { include: { category: true } },
          products: true,
        },
        orderBy: { priority: 'asc' },
      }),
      this.prisma.coupons.findMany({
        where: {
          status: true,
          start_date: { lte: now },
          end_date: { gte: now },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { offers, coupons };
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

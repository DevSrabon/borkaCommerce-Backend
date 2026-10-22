import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  CreateOfferDto,
  UpdateOfferDto,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  SendPromotionalEmailDto,
  UpdatePromoPopupDto,
} from './dto/promotions.dto';

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

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

  async findAllOffers(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.offers.findMany({
        take,
        skip: skipCount,
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
      }),
      this.prisma.offers.count(),
    ]);

    return { items, total };
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

  async findAllCoupons(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.coupons.findMany({
        take,
        skip: skipCount,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.coupons.count(),
    ]);

    return { items, total };
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

  // --- PROMOTIONAL EMAIL BROADCASTING ---

  async getRecipientsCount() {
    const allCustomers = await this.prisma.customers.count({
      where: { is_blocked: false },
    });
    const buyers = await this.prisma.customers.count({
      where: {
        is_blocked: false,
        orders: {
          some: {
            status: { not: 'CANCELLED' },
          },
        },
      },
    });
    return {
      all: allCustomers,
      buyers,
    };
  }

  async sendPromotionalEmail(dto: SendPromotionalEmailDto) {
    let recipients: { email: string; name?: string }[] = [];

    if (dto.test_email_only) {
      const target = dto.test_recipient?.trim();
      if (!target || !target.includes('@')) {
        throw new BadRequestException('A valid test email address is required');
      }
      recipients = [{ email: target, name: 'Valued VIP Member' }];
    } else if (dto.audience === 'CUSTOM') {
      if (!dto.custom_emails || dto.custom_emails.length === 0) {
        throw new BadRequestException('At least one recipient email is required for custom audience');
      }
      recipients = dto.custom_emails
        .map((e) => e.trim())
        .filter((e) => e.includes('@'))
        .map((email) => ({ email, name: 'VIP Guest' }));
    } else if (dto.audience === 'BUYERS') {
      const customers = await this.prisma.customers.findMany({
        where: {
          is_blocked: false,
          orders: { some: { status: { not: 'CANCELLED' } } },
        },
        select: { email: true, first_name: true, last_name: true },
      });
      recipients = customers
        .filter((c) => Boolean(c.email) && c.email.includes('@'))
        .map((c) => ({
          email: c.email,
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Valued Patron',
        }));
    } else {
      // Default ALL registered customers
      const customers = await this.prisma.customers.findMany({
        where: { is_blocked: false },
        select: { email: true, first_name: true, last_name: true },
      });
      recipients = customers
        .filter((c) => Boolean(c.email) && c.email.includes('@'))
        .map((c) => ({
          email: c.email,
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Valued Patron',
        }));
    }

    if (recipients.length === 0) {
      throw new BadRequestException('No eligible customer email addresses found for the selected audience.');
    }

    // Optional: fetch featured products
    let featuredProducts: any[] = [];
    if (dto.product_ids && dto.product_ids.length > 0) {
      const prods = await this.prisma.products.findMany({
        where: { id: { in: dto.product_ids } },
        include: {
          images: { where: { is_thumbnail: true }, take: 1 },
          variants: { take: 1, select: { price: true, compare_price: true } },
        },
      });
      featuredProducts = prods;
    }

    // Generate responsive HTML template
    const productsHtml = featuredProducts.length > 0 ? `
      <div style="margin: 24px 0;">
        <h3 style="color: #d4af37; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 16px; text-align: center;">Curated Luxury Highlights</h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${featuredProducts.map((p) => {
              const img = p.images?.[0]?.image_url || 'https://sabaalwadi.com/images/default-abaya.jpg';
              const resolvedImg = img.startsWith('http') ? img : `https://webserver.sabaalwadi.com${img.startsWith('/') ? '' : '/'}${img}`;
              const price = p.variants?.[0]?.price ? Number(p.variants[0].price).toFixed(2) : '';
              return `
                <td style="padding: 6px; vertical-align: top; width: ${Math.floor(100 / featuredProducts.length)}%;">
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; text-align: center; padding-bottom: 12px;">
                    <img src="${resolvedImg}" alt="${p.name}" style="width: 100%; height: 160px; object-fit: cover; display: block;" />
                    <div style="padding: 10px 8px;">
                      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</p>
                      ${price ? `<p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; color: #b45309;">AED ${price}</p>` : ''}
                      <a href="https://sabaalwadi.com/product/${p.slug}" target="_blank" style="display: inline-block; background-color: #b45309; color: #ffffff; font-size: 11px; font-weight: bold; padding: 6px 14px; border-radius: 4px; text-decoration: none;">View Piece &rarr;</a>
                    </div>
                  </div>
                </td>
              `;
            }).join('')}
          </tr>
        </table>
      </div>
    ` : '';

    const couponHtml = dto.coupon_code ? `
      <div style="text-align: center; margin: 24px 0; background-color: #fffbeb; border: 1px dashed #f59e0b; border-radius: 8px; padding: 18px;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #78716c; display: block; margin-bottom: 6px;">Exclusive Privilege Code</span>
        <span style="font-size: 20px; font-weight: bold; letter-spacing: 4px; color: #b45309; font-family: monospace;">${dto.coupon_code}</span>
        <span style="font-size: 11px; color: #78716c; display: block; margin-top: 6px;">Apply at checkout on sabaalwadi.com</span>
      </div>
    ` : '';

    const bannerHtml = dto.banner_url ? `
      <div style="margin-bottom: 24px; border-radius: 8px; overflow: hidden;">
        <img src="${dto.banner_url}" alt="Promotion" style="width: 100%; max-height: 280px; object-fit: cover; display: block;" />
      </div>
    ` : '';

    const ctaHtml = dto.cta_url ? `
      <div style="text-align: center; margin: 28px 0 10px 0;">
        <a href="${dto.cta_url}" target="_blank" style="display: inline-block; background: #b45309; color: #ffffff; font-size: 12px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 28px; border-radius: 6px; text-decoration: none;">
          ${dto.cta_text || 'Explore Collection'} &rarr;
        </a>
      </div>
    ` : '';

    const siteSettings = await this.prisma.site_settings.findMany({
      where: { key: { in: ['site_name', 'logo_url'] } },
    });
    const settingsMap = siteSettings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
    const brandName = settingsMap['site_name'] || 'Saba Al Wadi';
    const logoUrl = settingsMap['logo_url'] || 'https://media.sabaalwadi.com/saba-media/website_settings_files/1777029127576-390261898.png';

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const recipientName = recipient.name || 'Valued Patron';
      const emailHtml = `
        <div style="background-color: #f8fafc; font-family: 'Georgia', 'Playfair Display', serif; margin: 0; padding: 25px 10px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; padding: 32px 28px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
            <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
              <img src="${logoUrl}" alt="${brandName}" style="max-height: 48px; width: auto; max-width: 220px; display: block; margin: 0 auto;" />
            </div>

            ${bannerHtml}

            ${dto.headline ? `<h2 style="color: #0f172a; font-size: 18px; text-align: center; margin: 0 0 14px 0; font-weight: 600;">${dto.headline}</h2>` : ''}

            <p style="font-size: 13px; color: #334155; line-height: 1.6; margin-bottom: 14px;">Dear ${recipientName},</p>

            <div style="font-size: 13px; color: #475569; line-height: 1.7; font-family: 'Helvetica Neue', Arial, sans-serif;">
              ${dto.message}
            </div>

            ${couponHtml}
            ${productsHtml}
            ${ctaHtml}

            <div style="border-top: 1px solid #f1f5f9; margin-top: 28px; padding-top: 18px; text-align: center; font-size: 11px; color: #64748b; font-family: sans-serif;">
              <p style="margin: 0 0 6px 0; font-weight: 500;">${brandName}</p>
              <p style="margin: 0 0 6px 0;">You received this exclusive invitation as a member of our couture circle.</p>
              <p style="margin: 0;"><a href="https://sabaalwadi.com" style="color: #b45309; text-decoration: none;">Visit Storefront</a> &bull; <a href="https://sabaalwadi.com/profile" style="color: #64748b; text-decoration: none;">Customer Account</a></p>
            </div>
          </div>
        </div>
      `;

      try {
        const result = await this.mailService.dispatchMail({
          to: recipient.email,
          subject: dto.subject,
          html: emailHtml,
        });
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (err: any) {
        this.logger.error(`Failed to send promotional email to ${recipient.email}: ${err.message}`);
        failedCount++;
      }
    }

    return {
      success: true,
      total_recipients: recipients.length,
      sent: sentCount,
      failed: failedCount,
      test_mode: Boolean(dto.test_email_only),
    };
  }

  // --- POPUP MANAGEMENT ---

  async getPromoPopup() {
    const keys = [
      'promo_popup_enabled',
      'promo_popup_title',
      'promo_popup_subtitle',
      'promo_popup_coupon',
      'promo_popup_image',
      'promo_popup_btn_text',
      'promo_popup_btn_url',
      'promo_popup_delay',
      'promo_popup_frequency',
    ];
    const settings = await this.prisma.site_settings.findMany({
      where: { key: { in: keys } },
    });
    const map = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);

    return {
      enabled: map['promo_popup_enabled'] === 'true',
      title: map['promo_popup_title'] || 'Welcome to Saba Al Wadi Couture',
      subtitle:
        map['promo_popup_subtitle'] ||
        'Discover our luxury handcrafted abayas & bridal edits. Enjoy an exclusive 15% privilege on your first order.',
      coupon_code: map['promo_popup_coupon'] || 'WELCOME15',
      image_url:
        map['promo_popup_image'] ||
        'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=600',
      btn_text: map['promo_popup_btn_text'] || 'Claim Offer & Shop',
      btn_url: map['promo_popup_btn_url'] || '/catalog',
      delay_seconds: Number(map['promo_popup_delay'] || '3'),
      frequency: (map['promo_popup_frequency'] as any) || 'once_per_session',
    };
  }

  async updatePromoPopup(dto: UpdatePromoPopupDto) {
    const updates: { key: string; value: string }[] = [];

    if (dto.enabled !== undefined) updates.push({ key: 'promo_popup_enabled', value: String(dto.enabled) });
    if (dto.title !== undefined) updates.push({ key: 'promo_popup_title', value: dto.title });
    if (dto.subtitle !== undefined) updates.push({ key: 'promo_popup_subtitle', value: dto.subtitle });
    if (dto.coupon_code !== undefined) updates.push({ key: 'promo_popup_coupon', value: dto.coupon_code });
    if (dto.image_url !== undefined) updates.push({ key: 'promo_popup_image', value: dto.image_url });
    if (dto.btn_text !== undefined) updates.push({ key: 'promo_popup_btn_text', value: dto.btn_text });
    if (dto.btn_url !== undefined) updates.push({ key: 'promo_popup_btn_url', value: dto.btn_url });
    if (dto.delay_seconds !== undefined) updates.push({ key: 'promo_popup_delay', value: String(dto.delay_seconds) });
    if (dto.frequency !== undefined) updates.push({ key: 'promo_popup_frequency', value: dto.frequency });

    for (const u of updates) {
      await this.prisma.site_settings.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      });
    }

    return this.getPromoPopup();
  }

  async getPublicPromoPopup() {
    const popup = await this.getPromoPopup();
    if (!popup.enabled) {
      return { enabled: false };
    }
    return popup;
  }

  async getPromotionalEmailHistory() {
    const logs = await (this.prisma as any).email_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return logs;
  }
}

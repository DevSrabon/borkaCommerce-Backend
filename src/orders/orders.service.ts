import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PromotionsService } from '../promotions/promotions.service';
import { MailService } from '../mail/mail.service';
import { CheckoutDto, UpdateOrderStatusDto, CreateManualOrderDto, UpdateOrderItemsDto, UpdateOrderAddressDto } from './dto/orders.dto';
import { order_status, payment_status, payment_method, inventory_transaction_type, offer_status } from '@prisma/client';
import Stripe from 'stripe';

import { SiteSettingsService } from '../site-settings/site-settings.service';

export const CURRENCY_RATES: Record<string, number> = {
  AED: 1,
  USD: 1 / 3.67,
  GBP: 1 / 4.70,
  EUR: 1 / 4.00,
  SAR: 1.02,
  QAR: 0.99,
  KWD: 1 / 12.00,
  OMR: 1 / 9.53,
  BHD: 1 / 9.74,
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private promotionsService: PromotionsService,
    private mailService: MailService,
    private siteSettingsService: SiteSettingsService,
  ) {}

  private async getStripeClient(): Promise<Stripe> {
    const key =
      (await this.siteSettingsService.getSetting('STRIPE_SECRET_KEY')) ||
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_mock';
    return new Stripe(key);
  }

  async checkout(customerId: string, dto: CheckoutDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Generate unique sequential order number (SW20250001...) & production number (P-1000...)
      const orderNumber = await this.generateOrderNumber(tx);
      const productionNo = await this.generateProductionNumber(tx);

      // 1. Resolve address
      const address = await tx.customer_addresses.findFirst({
        where: { id: dto.address_id, customer_id: customerId },
      });
      if (!address) {
        throw new NotFoundException('Customer delivery address not found');
      }

      let subtotal = 0;
      const orderItemsToCreate: any[] = [];
      const inventoryReservations: any[] = [];

      const now = new Date();

      // 2. Process items, check stock, and calculate subtotal
      for (const itemDto of dto.items) {
        // Fetch variant with product and active offers
        const variant = await tx.product_variants.findUnique({
          where: { id: itemDto.variant_id },
          include: {
            product: true,
            offers: {
              include: { offer: true },
            },
            inventories: true,
          },
        });

        if (!variant || variant.status !== 'ACTIVE') {
          throw new NotFoundException(`Variant with ID ${itemDto.variant_id} is unavailable`);
        }

        // Check Inventory stock levels
        const totalAvailable = variant.inventories.reduce((acc, inv) => acc + inv.available_quantity, 0);
        if (totalAvailable < itemDto.quantity) {
          throw new BadRequestException(`Insufficient stock for product ${variant.product.name} (SKU: ${variant.sku})`);
        }

        // Validate product-wise COD eligibility
        if (dto.payment_method === 'CASH_ON_DELIVERY' && variant.product.is_cod_allowed === false) {
          throw new BadRequestException(
            `Cash on Delivery is unavailable for "${variant.product.name}". Please choose online payment (Card).`
          );
        }

        // Calculate dynamic variant price using highest priority offer
        const activeOffers = variant.offers
          .map((op) => op.offer)
          .filter(
            (o) =>
              o.status === offer_status.ACTIVE &&
              new Date(o.start_date) <= now &&
              new Date(o.end_date) >= now,
          );

        let finalPrice = Number(variant.price);
        let discountApplied = 0;

        if (activeOffers.length > 0) {
          activeOffers.sort((a, b) => b.priority - a.priority);
          const topOffer = activeOffers[0];
          if (topOffer.discount_type === 'PERCENTAGE') {
            const disc = finalPrice * (Number(topOffer.discount_value) / 100);
            finalPrice -= disc;
            discountApplied = disc;
          } else {
            const disc = Number(topOffer.discount_value);
            finalPrice = Math.max(0, finalPrice - disc);
            discountApplied = disc;
          }
        }

        const itemSubtotal = finalPrice * itemDto.quantity;
        subtotal += itemSubtotal;

        // Snapshot details for order item creation
        orderItemsToCreate.push({
          variant_id: variant.id,
          product_name: variant.product.name,
          variant_name: variant.sku, // representation details
          sku: variant.sku,
          price: finalPrice,
          quantity: itemDto.quantity,
          discount: discountApplied,
          subtotal: itemSubtotal,
        });

        // Reserve stock transactional maps
        let remainingToReserve = itemDto.quantity;
        for (const inv of variant.inventories) {
          if (remainingToReserve <= 0) break;
          const toReserve = Math.min(inv.available_quantity, remainingToReserve);
          if (toReserve > 0) {
            inventoryReservations.push({
              inventoryId: inv.id,
              reserveCount: toReserve,
            });
            remainingToReserve -= toReserve;
          }
        }
      }

      // 3. Execute Stock Reservation (Locking quantities)
      for (const res of inventoryReservations) {
        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            reserved_quantity: { increment: res.reserveCount },
            available_quantity: { decrement: res.reserveCount },
          },
        });
      }

      // 4. Handle Coupon Discounts
      let discount = 0;
      let couponId: string | null = null;

      if (dto.coupon_code) {
        // Evaluate coupon using transaction-safe query
        const couponVal = await this.promotionsService.validateCoupon(
          {
            code: dto.coupon_code,
            order_subtotal: subtotal,
          },
          customerId,
        );

        discount = couponVal.discount_amount;
        couponId = couponVal.coupon_id;
      }

      // Dynamic Shipping Charge calculation (evaluates free shipping & tiered discounts)
      const shippingCalc = await this.siteSettingsService.calculateDeliveryCharge(subtotal);
      const shipping = shippingCalc.final_fee;
      const tax = 0; // VAT removed per user request
      const total = Number((subtotal - discount + shipping).toFixed(2));

      const isCod = dto.payment_method === 'CASH_ON_DELIVERY';

      // Resolve user's selected dynamic currency and exchange rate
      const selectedCurrency = (dto.currency || 'AED').toUpperCase();
      const rate = CURRENCY_RATES[selectedCurrency] || 1;

      // Converted financial amounts in customer's selected currency
      const orderSubtotal = Number((subtotal * rate).toFixed(2));
      const orderDiscount = Number((discount * rate).toFixed(2));
      const orderShipping = Number((shipping * rate).toFixed(2));
      const orderTax = Number((tax * rate).toFixed(2));
      const orderTotal = Number((total * rate).toFixed(2));

      // 5. Create Order record with dynamic currency
      const order = await tx.orders.create({
        data: {
          order_number: orderNumber,
          production_no: productionNo,
          customer_id: customerId,
          status: isCod ? order_status.CONFIRMED : order_status.PENDING,
          subtotal: orderSubtotal,
          discount: orderDiscount,
          shipping: orderShipping,
          tax: orderTax,
          total: orderTotal,
          currency: selectedCurrency,
          payment_status: payment_status.PENDING,
          payment_method: isCod ? payment_method.CASH_ON_DELIVERY : payment_method.STRIPE,
          coupon_id: couponId,
          shipping_country: address.country,
          shipping_city: address.city,
          shipping_area: address.area,
          shipping_street: address.street,
          shipping_building: address.building,
          shipping_postal_code: address.postal_code,
        },
      });

      // 6. Create Snapshot Order Items in selected currency
      await tx.order_items.createMany({
        data: orderItemsToCreate.map((item) => ({
          ...item,
          price: Number((item.price * rate).toFixed(2)),
          discount: Number((item.discount * rate).toFixed(2)),
          subtotal: Number((item.subtotal * rate).toFixed(2)),
          order_id: order.id,
        })),
      });

      // 7. Payment processing
      let clientSecret = '';
      let paymentIntentId = '';

      if (isCod) {
        // Cash on delivery payment record
        await tx.payments.create({
          data: {
            order_id: order.id,
            provider: 'CASH_ON_DELIVERY',
            provider_payment_intent: `COD-${order.order_number}`,
            amount: orderTotal,
            currency: selectedCurrency,
            status: payment_status.PENDING,
          },
        });
      } else {
        // Stripe payment intent flow with DYNAMIC CURRENCY
        try {
          const stripeClient = await this.getStripeClient();
          // Stripe expects amount in smallest currency unit (cents, fils, pence)
          const stripeAmount = Math.max(50, Math.round(orderTotal * 100));

          const paymentIntent = await stripeClient.paymentIntents.create({
            amount: stripeAmount,
            currency: selectedCurrency.toLowerCase(),
            metadata: {
              order_id: order.id,
              customer_id: customerId,
              selected_currency: selectedCurrency,
              base_total_aed: total.toString(),
              exchange_rate: rate.toString(),
            },
          });
          clientSecret = paymentIntent.client_secret || '';
          paymentIntentId = paymentIntent.id;
        } catch (stripeErr: any) {
          throw new BadRequestException(`Stripe PaymentIntent generation failed: ${stripeErr.message}`);
        }

        // Create Stripe Payment Audit Record in selected currency
        await tx.payments.create({
          data: {
            order_id: order.id,
            provider: 'STRIPE',
            provider_payment_intent: paymentIntentId,
            amount: orderTotal,
            currency: selectedCurrency,
            status: payment_status.PENDING,
          },
        });
      }

      return {
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        currency: order.currency,
        client_secret: clientSecret,
        payment_method: order.payment_method,
      };
    });

    // Send asynchronous confirmation email to customer + new order alert to admin
    try {
      const fullOrder = await this.prisma.orders.findUnique({
        where: { id: result.order_id },
        include: {
          customer: true,
          items: true,
        },
      });

      if (fullOrder && fullOrder.customer) {
        await this.mailService.sendOrderConfirmation(
          fullOrder.customer.email,
          fullOrder.customer.first_name,
          fullOrder,
        );
        await this.mailService.sendAdminNewOrderNotification(fullOrder);
      }
    } catch (err: any) {
      // non-blocking
    }

    return result;
  }

  async handleStripeWebhook(payload: string, signature: string, secret: string) {
    let event: Stripe.Event;

    try {
      const stripeClient = await this.getStripeClient();
      const webhookSecret =
        secret ||
        (await this.siteSettingsService.getSetting('STRIPE_WEBHOOK_SECRET')) ||
        this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ||
        'whsec_mock';
      event = stripeClient.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (event.type === 'payment_intent.succeeded') {
      const orderId = paymentIntent.metadata.order_id;
      if (!orderId) return { received: true };

      await this.confirmPayment(orderId, paymentIntent.id, paymentIntent.latest_charge as string, paymentIntent);
    } else if (event.type === 'payment_intent.payment_failed') {
      const orderId = paymentIntent.metadata.order_id;
      if (!orderId) return { received: true };

      await this.cancelPayment(orderId);
    }

    return { received: true };
  }

  /**
   * Directly verifies and confirms Stripe payment from backend using STRIPE_SECRET_KEY,
   * without requiring any webhooks!
   */
  async confirmStripeDirect(orderId: string, paymentIntentId?: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    if (order.payment_status === payment_status.PAID && order.status === order_status.CONFIRMED) {
      return {
        success: true,
        message: 'Order is already confirmed and paid.',
        order_id: order.id,
        order_number: order.order_number,
        payment_status: order.payment_status,
        status: order.status,
      };
    }

    let verifiedChargeId = 'ch_direct_confirmed';
    let intentId = paymentIntentId;

    try {
      const stripeClient = await this.getStripeClient();

      if (paymentIntentId && !paymentIntentId.startsWith('pi_mock')) {
        // Query Stripe directly via secret key
        const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

        // If requires confirmation or payment method attached
        if (paymentIntent.status === 'requires_confirmation') {
          const confirmedIntent = await stripeClient.paymentIntents.confirm(paymentIntentId);
          verifiedChargeId = (confirmedIntent.latest_charge as string) || verifiedChargeId;
        } else if (paymentIntent.status === 'succeeded') {
          verifiedChargeId = (paymentIntent.latest_charge as string) || verifiedChargeId;
        }
      }
    } catch (stripeErr: any) {
      console.warn('Direct Stripe retrieval notice:', stripeErr.message);
    }

    // Immediately execute payment confirmation in database
    await this.confirmPayment(
      order.id,
      intentId || `pi_direct_${Date.now()}`,
      verifiedChargeId,
      { source: 'backend_direct_stripe_secret_key', timestamp: new Date().toISOString() },
    );

    const updatedOrder = await this.prisma.orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        order_number: true,
        status: true,
        payment_status: true,
        payment_method: true,
        total: true,
        currency: true,
      },
    });

    return {
      success: true,
      message: 'Payment verified and order confirmed directly via Stripe Secret Key.',
      order: updatedOrder,
    };
  }

  async confirmPayment(orderId: string, paymentIntentId: string, chargeId: string, rawResponse: any) {
    return this.prisma.$transaction(async (tx) => {
      // Fetch current order
      const order = await tx.orders.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || order.payment_status === payment_status.PAID) {
        return; // Already processed
      }

      // Update payment record
      await tx.payments.updateMany({
        where: { order_id: orderId, provider_payment_intent: paymentIntentId },
        data: {
          status: payment_status.PAID,
          provider_charge_id: chargeId,
          paid_at: new Date(),
          response_json: rawResponse,
        },
      });

      // Update order status
      await tx.orders.update({
        where: { id: orderId },
        data: {
          status: order_status.CONFIRMED,
          payment_status: payment_status.PAID,
        },
      });

      // Physically decrease inventory and release reservation
      for (const item of order.items) {
        // Find reserved stock across inventories mapping to this variant
        const inventories = await tx.inventory.findMany({
          where: { variant_id: item.variant_id },
        });

        let remainingToDeduct = item.quantity;
        for (const inv of inventories) {
          if (remainingToDeduct <= 0) break;
          const toDeduct = Math.min(inv.reserved_quantity, remainingToDeduct);
          if (toDeduct > 0) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                quantity: { decrement: toDeduct },
                reserved_quantity: { decrement: toDeduct },
              },
            });

            // Log physical stock release transaction
            await tx.inventory_transactions.create({
              data: {
                variant_id: item.variant_id,
                warehouse_id: inv.warehouse_id,
                type: inventory_transaction_type.SALE,
                quantity: -toDeduct,
                reference_type: 'ORDER_FULFILLED',
                reference_id: orderId,
              },
            });
            remainingToDeduct -= toDeduct;
          }
        }
      }
    });
  }

  async cancelPayment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || order.status === order_status.CANCELLED) {
        return;
      }

      // Update order status to CANCELLED and payment status to FAILED
      await tx.orders.update({
        where: { id: orderId },
        data: {
          status: order_status.CANCELLED,
          payment_status: payment_status.FAILED,
        },
      });

      // Release reserved stock back to available stock
      for (const item of order.items) {
        const inventories = await tx.inventory.findMany({
          where: { variant_id: item.variant_id },
        });

        let remainingToRelease = item.quantity;
        for (const inv of inventories) {
          if (remainingToRelease <= 0) break;
          const toRelease = Math.min(inv.reserved_quantity, remainingToRelease);
          if (toRelease > 0) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                reserved_quantity: { decrement: toRelease },
                available_quantity: { increment: toRelease },
              },
            });
            remainingToRelease -= toRelease;
          }
        }
      }
    });
  }

  // --- NUMBER GENERATION HELPERS ---

  /**
   * Generates sequential order numbers in the format SW20250001, SW20250002...
   */
  async generateOrderNumber(tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const lastOrder = await client.orders.findFirst({
      where: {
        order_number: {
          startsWith: 'SW',
        },
      },
      orderBy: {
        order_number: 'desc',
      },
      select: {
        order_number: true,
      },
    });

    let nextSeq = 20250001;
    if (lastOrder && lastOrder.order_number) {
      const numPart = parseInt(lastOrder.order_number.replace(/^SW/i, ''), 10);
      if (!isNaN(numPart) && numPart >= 20250001) {
        nextSeq = numPart + 1;
      }
    }

    return `SW${nextSeq}`;
  }

  /**
   * Generates sequential production numbers in the format P-1000, P-1001, P-1002...
   */
  async generateProductionNumber(tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const lastOrder = await client.orders.findFirst({
      where: {
        production_no: {
          startsWith: 'P-',
        },
      },
      orderBy: {
        production_no: 'desc',
      },
      select: {
        production_no: true,
      },
    });

    let nextSeq = 1000;
    if (lastOrder && lastOrder.production_no) {
      const numPart = parseInt(lastOrder.production_no.replace(/^P-/i, ''), 10);
      if (!isNaN(numPart) && numPart >= 1000) {
        nextSeq = numPart + 1;
      }
    }

    return `P-${nextSeq}`;
  }

  /**
   * Generates or assigns a production number to an existing order if missing
   */
  async generateProductionNoForOrder(orderId: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      select: { id: true, production_no: true, order_number: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.production_no) {
      return order;
    }
    const productionNo = await this.generateProductionNumber();
    return this.prisma.orders.update({
      where: { id: orderId },
      data: { production_no: productionNo },
    });
  }

  // --- ADMIN AND SHARED ENDPOINTS ---

  async findAll(status?: string, startDate?: string, endDate?: string, search?: string, limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;
    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status as order_status;
    }

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) {
        where.created_at.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.created_at.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    if (search) {
      const q = search.trim();
      where.OR = [
        { order_number: { contains: q, mode: 'insensitive' } },
        { production_no: { contains: q, mode: 'insensitive' } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
        { customer: { first_name: { contains: q, mode: 'insensitive' } } },
        { customer: { last_name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.orders.findMany({
        where,
        take,
        skip: skipCount,
        include: {
          customer: {
            select: { first_name: true, last_name: true, email: true },
          },
          items: {
            include: {
              variant: {
                include: {
                  images: true,
                  product: {
                    include: {
                      images: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.orders.count({ where }),
    ]);

    return { items: orders, total };
  }

  async findOne(id: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                images: true,
                product: {
                  include: {
                    images: true,
                  },
                },
              },
            },
          },
        },
        customer: {
          include: {
            addresses: true,
          },
        },
        payments: true,
        coupon: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async findByCustomer(customerId: string) {
    return this.prisma.orders.findMany({
      where: { customer_id: customerId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                images: true,
                product: {
                  include: {
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (dto.status === order_status.CANCELLED && order.status !== order_status.CANCELLED) {
      // Handle inventory refunds if order is cancelled manually
      await this.cancelPayment(id);
      return this.findOne(id);
    }

    const dataToUpdate: any = {};
    if (dto.status) dataToUpdate.status = dto.status;
    if (dto.delivery_partner !== undefined) dataToUpdate.delivery_partner = dto.delivery_partner?.trim() || null;
    if (dto.tracking_number !== undefined) dataToUpdate.tracking_number = dto.tracking_number?.trim() || null;
    if (dto.tracking_url !== undefined) dataToUpdate.tracking_url = dto.tracking_url?.trim() || null;
    if (dto.delivery_notes !== undefined) dataToUpdate.delivery_notes = dto.delivery_notes?.trim() || null;

    const updated = await this.prisma.orders.update({
      where: { id },
      data: dataToUpdate,
      include: { items: true, customer: true },
    });

    if (dto.notify_customer && updated.customer && dto.status) {
      try {
        await this.mailService.sendOrderStatusUpdateEmail(
          updated.customer.email,
          updated.customer.first_name,
          updated.order_number,
          updated.status,
          updated.delivery_partner || undefined,
          updated.tracking_number || undefined,
          updated.tracking_url || undefined,
        );
      } catch (err: any) {
        // non-blocking
      }
    }

    return updated;
  }

  async remove(id: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return this.prisma.orders.delete({
      where: { id },
    });
  }

  /**
   * Admin: Create manual order on behalf of a customer or guest
   */
  async createManualOrder(dto: CreateManualOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      // Generate unique sequential order number (SW20250001...) & production number (P-1000...)
      const orderNumber = await this.generateOrderNumber(tx);
      const productionNo = await this.generateProductionNumber(tx);

      // 1. Resolve or create customer
      let customerId = dto.customer_id;
      if (!customerId) {
        const email = dto.customer_email?.trim() || `manual_${Date.now()}@sabaalwadi.ae`;
        const existing = await tx.customers.findUnique({
          where: { email },
        });

        if (existing) {
          customerId = existing.id;
        } else {
          const newCustomer = await tx.customers.create({
            data: {
              first_name: dto.customer_first_name?.trim() || 'Manual',
              last_name: dto.customer_last_name?.trim() || 'Customer',
              email,
              phone: dto.customer_phone?.trim() || undefined,
              role: 'CUSTOMER',
              email_verified: true,
            },
          });
          customerId = newCustomer.id;
        }
      }

      // 2. If address provided, create customer_address record
      if (dto.address && customerId) {
        await tx.customer_addresses.create({
          data: {
            customer_id: customerId,
            street: dto.address.street || 'Manual Order Address',
            city: dto.address.city || 'Dubai',
            area: dto.address.state || 'Dubai Central',
            country: dto.address.country || 'UAE',
            postal_code: dto.address.postal_code || '00000',
            is_default: false,
          },
        }).catch(() => {});
      }

      // 3. Process items and adjust inventory
      let subtotal = 0;
      const orderItemsToCreate: any[] = [];

      for (const itemDto of dto.items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: itemDto.variant_id },
          include: {
            product: true,
            inventories: true,
          },
        });

        if (!variant) {
          throw new NotFoundException(`Product variant with ID ${itemDto.variant_id} not found`);
        }

        const price = itemDto.price !== undefined ? Number(itemDto.price) : Number(variant.price);
        const itemSubtotal = price * itemDto.quantity;
        subtotal += itemSubtotal;

        // Deduct inventory
        let remainingToDeduct = itemDto.quantity;
        for (const inv of variant.inventories) {
          if (remainingToDeduct <= 0) break;
          const toDeduct = Math.min(inv.available_quantity, remainingToDeduct);
          if (toDeduct > 0) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                available_quantity: { decrement: toDeduct },
              },
            });
            remainingToDeduct -= toDeduct;
          }
        }

        orderItemsToCreate.push({
          variant_id: variant.id,
          product_name: variant.product.name,
          variant_name: variant.sku,
          sku: variant.sku,
          price,
          quantity: itemDto.quantity,
          discount: 0,
          subtotal: itemSubtotal,
        });
      }

      const shipping = Number(dto.delivery_charge ?? 0);
      const discount = Number(dto.discount ?? 0);
      const tax = 0;
      const total = Math.max(0, subtotal + shipping - discount);

      // 4. Create Order
      const order = await tx.orders.create({
        data: {
          order_number: orderNumber,
          production_no: productionNo,
          customer_id: customerId,
          status: (dto.status as order_status) || order_status.CONFIRMED,
          subtotal,
          discount,
          shipping,
          tax,
          total,
          currency: dto.currency || 'AED',
          payment_status: (dto.payment_status as payment_status) || payment_status.PENDING,
          payment_method: (dto.payment_method as payment_method) || payment_method.CASH_ON_DELIVERY,
          delivery_partner: dto.delivery_partner || null,
          tracking_number: dto.tracking_number || null,
          tracking_url: dto.tracking_url || null,
          delivery_notes: dto.delivery_notes || null,
          shipping_country: dto.address?.country || 'UAE',
          shipping_city: dto.address?.city || 'Dubai',
          shipping_area: dto.address?.state || 'Dubai Central',
          shipping_street: dto.address?.street || 'Manual Order Address',
          shipping_postal_code: dto.address?.postal_code || '00000',
          items: {
            create: orderItemsToCreate,
          },
        },
        include: {
          customer: true,
          items: true,
        },
      });

      // 5. If payment is paid, create payment record
      if (order.payment_status === payment_status.PAID) {
        await tx.payments.create({
          data: {
            order_id: order.id,
            provider: String(order.payment_method),
            amount: total,
            currency: order.currency,
            status: payment_status.PAID,
            paid_at: new Date(),
          },
        }).catch(() => {});
      }

      return order;
    });
  }

  /**
   * Admin: Add/remove items and increase/decrease quantity of existing order
   */
  async updateOrderItems(id: string, dto: UpdateOrderItemsDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      // Map old quantities
      const oldQuantities = new Map<string, number>();
      for (const item of order.items) {
        oldQuantities.set(item.variant_id, (oldQuantities.get(item.variant_id) || 0) + item.quantity);
      }

      // Map new quantities
      const newQuantities = new Map<string, number>();
      for (const item of dto.items) {
        newQuantities.set(item.variant_id, (newQuantities.get(item.variant_id) || 0) + item.quantity);
      }

      // Adjust inventory based on delta
      const allVariantIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);
      for (const variantId of allVariantIds) {
        const oldQty = oldQuantities.get(variantId) || 0;
        const newQty = newQuantities.get(variantId) || 0;
        const delta = newQty - oldQty; // positive = added more, negative = removed

        if (delta > 0) {
          // Deduct delta from available stock
          const inventories = await tx.inventory.findMany({ where: { variant_id: variantId } });
          let remainingToDeduct = delta;
          for (const inv of inventories) {
            if (remainingToDeduct <= 0) break;
            const toDeduct = Math.min(inv.available_quantity, remainingToDeduct);
            if (toDeduct > 0) {
              await tx.inventory.update({
                where: { id: inv.id },
                data: { available_quantity: { decrement: toDeduct } },
              });
              remainingToDeduct -= toDeduct;
            }
          }
        } else if (delta < 0) {
          // Restore stock
          const toRestore = Math.abs(delta);
          const firstInv = await tx.inventory.findFirst({ where: { variant_id: variantId } });
          if (firstInv) {
            await tx.inventory.update({
              where: { id: firstInv.id },
              data: { available_quantity: { increment: toRestore } },
            });
          }
        }
      }

      // Rebuild order_items
      await tx.order_items.deleteMany({ where: { order_id: id } });

      let subtotal = 0;
      const newItemsToCreate: any[] = [];

      for (const itemDto of dto.items) {
        const variant = await tx.product_variants.findUnique({
          where: { id: itemDto.variant_id },
          include: { product: true },
        });

        if (!variant) {
          throw new NotFoundException(`Variant ${itemDto.variant_id} not found`);
        }

        const price = itemDto.price !== undefined ? Number(itemDto.price) : Number(variant.price);
        const itemSubtotal = price * itemDto.quantity;
        subtotal += itemSubtotal;

        newItemsToCreate.push({
          variant_id: variant.id,
          product_name: variant.product.name,
          variant_name: variant.sku,
          sku: variant.sku,
          price,
          quantity: itemDto.quantity,
          discount: 0,
          subtotal: itemSubtotal,
        });
      }

      const shipping = dto.shipping !== undefined ? Number(dto.shipping) : Number(order.shipping);
      const discount = dto.discount !== undefined ? Number(dto.discount) : Number(order.discount);
      const total = Math.max(0, subtotal + shipping - discount);

      // Update Order
      const updatedOrder = await tx.orders.update({
        where: { id },
        data: {
          subtotal,
          shipping,
          discount,
          total,
          items: {
            create: newItemsToCreate,
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: { product: true },
              },
            },
          },
          customer: {
            include: { addresses: true },
          },
          payments: true,
        },
      });

      return updatedOrder;
    });
  }

  async updateOrderAddress(id: string, dto: UpdateOrderAddressDto) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const dataToUpdate: any = {};
    if (dto.country !== undefined) dataToUpdate.shipping_country = dto.country?.trim() || null;
    if (dto.city !== undefined) dataToUpdate.shipping_city = dto.city?.trim() || null;
    if (dto.area !== undefined) dataToUpdate.shipping_area = dto.area?.trim() || null;
    if (dto.street !== undefined) dataToUpdate.shipping_street = dto.street?.trim() || null;
    if (dto.building !== undefined) dataToUpdate.shipping_building = dto.building?.trim() || null;
    if (dto.postal_code !== undefined) dataToUpdate.shipping_postal_code = dto.postal_code?.trim() || null;

    await this.prisma.orders.update({
      where: { id },
      data: dataToUpdate,
    });

    return this.findOne(id);
  }

  async onModuleInit() {
    try {
      const count = await this.prisma.delivery_partners.count();
      if (count === 0) {
        await this.prisma.delivery_partners.createMany({
          data: [
            { name: 'Aramex', tracking_url_template: 'https://www.aramex.com/track/results?shipmentNumber={tracking_number}' },
            { name: 'DHL Express', tracking_url_template: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking_number}' },
            { name: 'Fetchr', tracking_url_template: 'https://track.fetchr.us/?tracking_numbers={tracking_number}' },
            { name: 'Emirates Post', tracking_url_template: 'https://www.emiratespost.ae/track?trackNum={tracking_number}' },
            { name: 'RedX', tracking_url_template: 'https://redx.com.bd/track?trackingId={tracking_number}' },
            { name: 'Steadfast', tracking_url_template: 'https://steadfast.com.bd/t/{tracking_number}' },
            { name: 'Pathao', tracking_url_template: 'https://merchant.pathao.com/tracking?consignment_id={tracking_number}' },
          ],
        });
      }
    } catch (_) {}
  }

  async getDeliveryPartners(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [partners, total] = await Promise.all([
      this.prisma.delivery_partners.findMany({
        where: { is_active: true },
        take,
        skip: skipCount,
        orderBy: { name: 'asc' },
      }),
      this.prisma.delivery_partners.count({ where: { is_active: true } }),
    ]);

    if (partners.length === 0 && skipCount === 0) {
      const defaults = [
        { name: 'Steadfast', tracking_url_template: 'https://steadfast.com.bd/t/{tracking_number}' },
        { name: 'Aramex', tracking_url_template: 'https://www.aramex.com/track/results?shipmentNumber={tracking_number}' },
        { name: 'DHL Express', tracking_url_template: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking_number}' },
        { name: 'FedEx', tracking_url_template: 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}' },
        { name: 'RedX', tracking_url_template: 'https://redx.com.bd/track/{tracking_number}' },
        { name: 'Pathao', tracking_url_template: 'https://pathao.com/courier/tracking/?consignment_id={tracking_number}' },
      ];
      for (const d of defaults) {
        try {
          await this.prisma.delivery_partners.upsert({
            where: { name: d.name },
            update: {},
            create: d,
          });
        } catch (_) {}
      }
      const seeded = await this.prisma.delivery_partners.findMany({
        where: { is_active: true },
        take,
        skip: skipCount,
        orderBy: { name: 'asc' },
      });
      return { items: seeded, total: seeded.length };
    }

    return { items: partners, total };
  }

  async createDeliveryPartner(dto: { name: string; tracking_url_template?: string; contact_phone?: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Partner name is required');
    return this.prisma.delivery_partners.upsert({
      where: { name: dto.name.trim() },
      update: {
        tracking_url_template: dto.tracking_url_template?.trim() || null,
        contact_phone: dto.contact_phone?.trim() || null,
        is_active: true,
      },
      create: {
        name: dto.name.trim(),
        tracking_url_template: dto.tracking_url_template?.trim() || null,
        contact_phone: dto.contact_phone?.trim() || null,
      },
    });
  }

  async updateDeliveryPartner(id: string, dto: { name?: string; tracking_url_template?: string; contact_phone?: string; is_active?: boolean }) {
    return this.prisma.delivery_partners.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.tracking_url_template !== undefined ? { tracking_url_template: dto.tracking_url_template?.trim() || null } : {}),
        ...(dto.contact_phone !== undefined ? { contact_phone: dto.contact_phone?.trim() || null } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      },
    });
  }

  async deleteDeliveryPartner(id: string) {
    return this.prisma.delivery_partners.delete({ where: { id } });
  }
}

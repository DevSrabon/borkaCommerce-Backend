import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PromotionsService } from '../promotions/promotions.service';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/orders.dto';
import { order_status, payment_status, payment_method, inventory_transaction_type, offer_status } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class OrdersService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private promotionsService: PromotionsService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY') || 'sk_test_mock';
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-01-27.accompany' as any, // Use standard stable fallback version or client choice
    });
  }

  async checkout(customerId: string, dto: CheckoutDto) {
    // Generate a unique order number (e.g. BC-YYYYMMDD-XXXX)
    const orderNumber = `BC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return this.prisma.$transaction(async (tx) => {
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

      // Calculations
      const shipping = subtotal > 500 ? 0 : 20.00; // Free shipping over 500 AED
      const tax = Number(((subtotal - discount) * 0.05).toFixed(2)); // 5% VAT in UAE
      const total = Number((subtotal - discount + shipping + tax).toFixed(2));

      // 5. Create Order record
      const order = await tx.orders.create({
        data: {
          order_number: orderNumber,
          customer_id: customerId,
          status: order_status.PENDING,
          subtotal,
          discount,
          shipping,
          tax,
          total,
          currency: 'AED',
          payment_status: payment_status.PENDING,
          payment_method: payment_method.STRIPE,
          coupon_id: couponId,
        },
      });

      // 6. Create Snapshot Order Items
      await tx.order_items.createMany({
        data: orderItemsToCreate.map((item) => ({
          ...item,
          order_id: order.id,
        })),
      });

      // 7. Create Stripe PaymentIntent
      let clientSecret = '';
      let paymentIntentId = '';

      try {
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: Math.round(total * 100), // convert fils to AED cents
          currency: 'aed',
          metadata: {
            order_id: order.id,
            customer_id: customerId,
          },
        });
        clientSecret = paymentIntent.client_secret || '';
        paymentIntentId = paymentIntent.id;
      } catch (stripeErr) {
        throw new BadRequestException(`Stripe PaymentIntent generation failed: ${stripeErr.message}`);
      }

      // 8. Create Payment Audit Record
      await tx.payments.create({
        data: {
          order_id: order.id,
          provider: 'STRIPE',
          provider_payment_intent: paymentIntentId,
          amount: total,
          currency: 'AED',
          status: payment_status.PENDING,
        },
      });

      return {
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        client_secret: clientSecret,
      };
    });
  }

  async handleStripeWebhook(payload: string, signature: string, secret: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
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

  // --- ADMIN AND SHARED ENDPOINTS ---

  async findAll() {
    return this.prisma.orders.findMany({
      include: {
        customer: {
          select: { first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
        customer: true,
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
        items: true,
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

    return this.prisma.orders.update({
      where: { id },
      data: { status: dto.status },
      include: { items: true },
    });
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
}

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inventory_transaction_type, offer_status, order_status, payment_method, payment_status } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CheckoutDto, CreateManualOrderDto, UpdateOrderAddressDto, UpdateOrderItemsDto, UpdateOrderStatusDto } from './dto/orders.dto';

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
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private promotionsService: PromotionsService,
    private mailService: MailService,
    private siteSettingsService: SiteSettingsService,
    private notificationsService: NotificationsService,
  ) {}

  private async getStripeClient(): Promise<Stripe> {
    const key =
      (await this.siteSettingsService.getSetting('STRIPE_SECRET_KEY')) ||
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_mock';
    return new Stripe(key);
  }

  async recordStripeLog(entry: {
    eventType: string;
    orderId?: string | null;
    customerId?: string | null;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    amount?: number | null;
    currency?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    requestData?: any;
    responseData?: any;
  }) {
    try {
      let formattedResponseData: string | null = null;
      if (entry.responseData !== undefined && entry.responseData !== null) {
        if (typeof entry.responseData === 'string') {
          formattedResponseData = entry.responseData;
        } else if (entry.responseData instanceof Error || (entry.responseData as any).raw) {
          const rawPayload = (entry.responseData as any).raw || {};
          formattedResponseData = JSON.stringify(
            {
              error_type: (entry.responseData as any).type,
              error_code: (entry.responseData as any).code,
              error_message: (entry.responseData as any).message,
              status_code: (entry.responseData as any).statusCode,
              param: (entry.responseData as any).param,
              decline_code: (entry.responseData as any).decline_code,
              doc_url: (entry.responseData as any).doc_url,
              raw: rawPayload,
              ...entry.responseData,
            },
            null,
            2,
          );
        } else {
          formattedResponseData = JSON.stringify(entry.responseData, null, 2);
        }
      }

      await (this.prisma as any).stripe_logs.create({
        data: {
          event_type: entry.eventType,
          order_id: entry.orderId || null,
          customer_id: entry.customerId || null,
          status: entry.status,
          amount: entry.amount !== undefined && entry.amount !== null ? Number(entry.amount) : null,
          currency: entry.currency || null,
          error_code: entry.errorCode || null,
          error_message: entry.errorMessage || null,
          request_data: entry.requestData ? (typeof entry.requestData === 'string' ? entry.requestData : JSON.stringify(entry.requestData, null, 2)) : null,
          response_data: formattedResponseData,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to record stripe_log: ${e.message}`);
    }
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

      // Pre-fetch all active offers and category taxonomy for robust offer resolution
      const [allActiveOffersInDb, allCategories] = await Promise.all([
        tx.offers.findMany({
          where: {
            status: offer_status.ACTIVE,
            start_date: { lte: now },
            end_date: { gte: now },
          },
          include: {
            categories: true,
            products: true,
          },
        }),
        tx.categories.findMany({
          select: { id: true, parent_id: true },
        }),
      ]);

      const categoryParentMap = new Map<string, string | null>(
        allCategories.map((c) => [c.id, c.parent_id])
      );

      // 2. Process items, check stock, and calculate subtotal
      for (const itemDto of dto.items) {
        // Fetch variant with product, all associated categories and active offers
        const variant = await tx.product_variants.findUnique({
          where: { id: itemDto.variant_id },
          include: {
            product: {
              include: {
                product_categories: true,
                related_categories: true,
              },
            },
            offers: {
              include: { offer: true },
            },
            inventories: true,
            attributes: {
              include: {
                attribute_value: {
                  include: { attribute: true },
                },
              },
            },
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

        // Match all categories associated with this product including parent categories
        const productCategoryIds = [
          ...(variant.product.product_categories || []).map((pc: any) => pc.category_id),
          ...(variant.product.related_categories || []).map((rc: any) => rc.category_id),
        ];

        const allProductCategoryIds = new Set<string>(productCategoryIds);
        for (const catId of productCategoryIds) {
          const parentId = categoryParentMap.get(catId);
          if (parentId) allProductCategoryIds.add(parentId);
        }

        // Match applicable active offers: global, category-specific, product/variant-specific
        const allActiveOffers = allActiveOffersInDb.filter((offer) => {
          const isGlobal =
            (!offer.categories || offer.categories.length === 0) &&
            (!offer.products || offer.products.length === 0);
          if (isGlobal) return true;

          const matchesCategory = offer.categories?.some((oc: any) =>
            allProductCategoryIds.has(oc.category_id)
          );
          if (matchesCategory) return true;

          const matchesVariant = offer.products?.some(
            (op: any) => op.variant_id === variant.id
          );
          if (matchesVariant) return true;

          return false;
        });

        allActiveOffers.sort((a, b) => b.priority - a.priority);

        let finalPrice = Number(variant.price);
        let discountApplied = 0;

        if (allActiveOffers.length > 0) {
          const topOffer = allActiveOffers[0];
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

        finalPrice = Number(finalPrice.toFixed(2));
        discountApplied = Number(discountApplied.toFixed(2));

        const itemSubtotal = finalPrice * itemDto.quantity;
        subtotal += itemSubtotal;

        const attrSummary = (variant.attributes || [])
          .map((a: any) => `${a.attribute_value?.attribute?.name || 'Option'}: ${a.attribute_value?.value || ''}`)
          .filter(Boolean)
          .join(', ');

        // Snapshot details for order item creation
        orderItemsToCreate.push({
          variant_id: variant.id,
          product_name: variant.product.name,
          variant_name: attrSummary || variant.sku,
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

      // Resolve user's selected dynamic currency and exchange rate from site settings
      const selectedCurrency = (dto.currency || 'AED').toUpperCase();
      let rate = CURRENCY_RATES[selectedCurrency] || 1;
      if (selectedCurrency !== 'AED') {
        const dynamicRateStr = await this.siteSettingsService.getSetting(`currency_rate_${selectedCurrency.toLowerCase()}`);
        const parsedRate = parseFloat(dynamicRateStr);
        if (!isNaN(parsedRate) && parsedRate > 0) {
          rate = parsedRate;
        }
      }

      // Converted financial amounts in customer's selected currency
      const orderSubtotal = Number((subtotal * rate).toFixed(2));
      const orderDiscount = Number((discount * rate).toFixed(2));
      const orderShipping = Number((shipping * rate).toFixed(2));
      const orderTax = Number((tax * rate).toFixed(2));
      const orderTotal = Number((orderSubtotal - orderDiscount + orderShipping).toFixed(2));

      // 5. Create Order record with dynamic currency
      const order = await tx.orders.create({
        data: {
          order_number: orderNumber,
          production_no: productionNo,
          customer_id: customerId,
          status: order_status.PENDING,
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
          shipping_phone: address.phone,
          shipping_city: address.city,
          shipping_postal_code: address.postal_code,
          shipping_full_address: address.full_address,
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
      let checkoutUrl = '';
      let stripeSessionId = '';

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
        // Stripe Hosted Checkout Session flow (safe, avoids raw card errors, 3D secure ready)
        try {
          const stripeClient = await this.getStripeClient();
          const stripeAmount = Math.max(50, Math.round(orderTotal * 100));

          const customer = await tx.customers.findUnique({
            where: { id: customerId },
            select: { email: true, first_name: true, last_name: true },
          });

          const storeUrl =
            (dto.origin && dto.origin.trim()) ||
            (await this.siteSettingsService.getSetting('STOREFRONT_URL')) ||
            process.env.STOREFRONT_URL ||
            'http://localhost:3000';

          const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
              {
                price_data: {
                  currency: selectedCurrency.toLowerCase(),
                  product_data: {
                    name: `Saba Al Wadi - Order #${order.order_number}`,
                    description: `${orderItemsToCreate.length} luxury modest garment(s)`,
                  },
                  unit_amount: stripeAmount,
                },
                quantity: 1,
              },
            ],
            mode: 'payment',
            customer_email: customer?.email || undefined,
            client_reference_id: order.id,
            metadata: {
              order_id: order.id,
              order_number: order.order_number,
              customer_id: customerId,
              currency: selectedCurrency,
              base_total_aed: total.toString(),
            },
            expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // Expires after 30 minutes!
            success_url: `${storeUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
            cancel_url: `${storeUrl}/checkout/payment-retry?order_id=${order.id}&cancelled=true`,
          });

          checkoutUrl = session.url || '';
          stripeSessionId = session.id;

          await this.recordStripeLog({
            eventType: 'CREATE_CHECKOUT_SESSION',
            orderId: order.id,
            customerId,
            status: 'SUCCESS',
            amount: orderTotal,
            currency: selectedCurrency,
            requestData: { amount: stripeAmount, currency: selectedCurrency.toLowerCase(), order_id: order.id },
            responseData: session,
          });
        } catch (stripeErr: any) {
          await this.recordStripeLog({
            eventType: 'CREATE_CHECKOUT_SESSION',
            orderId: order.id,
            customerId,
            status: 'FAILED',
            amount: orderTotal,
            currency: selectedCurrency,
            errorCode: stripeErr.code || stripeErr.type || 'CHECKOUT_SESSION_ERROR',
            errorMessage: stripeErr.message,
            requestData: { amount: Math.max(50, Math.round(orderTotal * 100)), currency: selectedCurrency.toLowerCase(), order_id: order.id },
            responseData: stripeErr.raw || stripeErr,
          });
          throw new BadRequestException(`Stripe Checkout Session generation failed: ${stripeErr.message}`);
        }

        // Create Stripe Payment Audit Record in selected currency
        await tx.payments.create({
          data: {
            order_id: order.id,
            provider: 'STRIPE',
            provider_payment_intent: stripeSessionId,
            amount: orderTotal,
            currency: selectedCurrency,
            status: payment_status.PENDING,
            response_json: { session_id: stripeSessionId, checkout_url: checkoutUrl } as any,
          },
        });
      }

      return {
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        currency: order.currency,
        checkout_url: checkoutUrl,
        session_id: stripeSessionId,
        payment_method: order.payment_method,
      };
    });

    // Send confirmation email only for COD orders immediately. For Stripe, sent after verification!
    if (result.payment_method === payment_method.CASH_ON_DELIVERY) {
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

        // Real-time notification for admin panel
        await this.notificationsService.createNotification({
          type: 'ORDER',
          title: 'New Customer Order (COD)',
          message: `Order #${result.order_number} placed by ${fullOrder?.customer?.first_name || 'Customer'} (${result.currency} ${result.total})`,
          link: `/admin/orders/${result.order_id}`,
          metadata: {
            order_id: result.order_id,
            order_number: result.order_number,
            total: result.total,
            currency: result.currency,
            customer_name: `${fullOrder?.customer?.first_name || ''} ${fullOrder?.customer?.last_name || ''}`.trim(),
          },
        });
      } catch (err: any) {
        // non-blocking
      }
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
      await this.recordStripeLog({
        eventType: 'WEBHOOK_EVENT',
        status: 'FAILED',
        errorCode: 'WEBHOOK_SIGNATURE_FAILED',
        errorMessage: err.message,
        responseData: err.raw || err,
      });
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    await this.recordStripeLog({
      eventType: `WEBHOOK_${event.type.toUpperCase().replace(/\./g, '_')}`,
      orderId: paymentIntent?.metadata?.order_id || null,
      customerId: paymentIntent?.metadata?.customer_id || null,
      status: event.type.includes('fail') ? 'FAILED' : 'SUCCESS',
      amount: paymentIntent?.amount ? paymentIntent.amount / 100 : undefined,
      currency: paymentIntent?.currency,
      errorCode: (paymentIntent?.last_payment_error as any)?.code || null,
      errorMessage: (paymentIntent?.last_payment_error as any)?.message || null,
      responseData: event,
    });

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
   * Strictly verifies and confirms Stripe payment directly using STRIPE_SECRET_KEY.
   * If card details are supplied, creates a PaymentMethod with Stripe and confirms the intent.
   * Throws an error if Stripe declines the card or authorization fails.
   */
  async confirmStripeDirect(
    orderId: string,
    paymentIntentId?: string,
    card?: {
      number: string;
      exp_month: string | number;
      exp_year: string | number;
      cvc: string;
      name?: string;
    },
  ) {
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

    const stripeClient = await this.getStripeClient();
    let verifiedChargeId = '';
    let intentId = paymentIntentId || '';

    // If card details were submitted, process real charge via Stripe
    if (card && card.number) {
      const cleanNumber = String(card.number).replace(/\s+/g, '');
      if (cleanNumber.length < 13 || cleanNumber.length > 19) {
        await this.recordStripeLog({
          eventType: 'CONFIRM_DIRECT_CARD',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'FAILED',
          amount: Number(order.total),
          currency: order.currency,
          errorCode: 'INVALID_CARD_NUMBER',
          errorMessage: 'Invalid card number length.',
        });
        throw new BadRequestException('Invalid card number. Please check your credit/debit card number.');
      }
      if (!card.exp_month || !card.exp_year || !card.cvc) {
        await this.recordStripeLog({
          eventType: 'CONFIRM_DIRECT_CARD',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'FAILED',
          amount: Number(order.total),
          currency: order.currency,
          errorCode: 'MISSING_CARD_DETAILS',
          errorMessage: 'Card expiry date or CVC missing.',
        });
        throw new BadRequestException('Card expiry date (MM/YY) and CVC are required.');
      }

      const expMonth = Number(card.exp_month);
      let expYear = Number(card.exp_year);
      if (expYear < 100) expYear += 2000;

      try {
        // 1. Create PaymentMethod on Stripe
        const paymentMethod = await stripeClient.paymentMethods.create({
          type: 'card',
          card: {
            number: cleanNumber,
            exp_month: expMonth,
            exp_year: expYear,
            cvc: String(card.cvc).trim(),
          },
          billing_details: {
            name: card.name || `${order.customer.first_name} ${order.customer.last_name}`,
            email: order.customer.email,
          },
        });

        // 2. Attach to PaymentIntent and confirm
        if (!paymentIntentId) {
          throw new BadRequestException('PaymentIntent ID is required for Stripe card confirmation.');
        }

        const confirmed = await stripeClient.paymentIntents.confirm(paymentIntentId, {
          payment_method: paymentMethod.id,
        });

        if (confirmed.status !== 'succeeded') {
          await this.recordStripeLog({
            eventType: 'CONFIRM_DIRECT_CARD',
            orderId: order.id,
            customerId: order.customer_id,
            status: 'FAILED',
            amount: Number(order.total),
            currency: order.currency,
            errorCode: 'STATUS_NOT_SUCCEEDED',
            errorMessage: `Card authorization status: ${confirmed.status}.`,
            requestData: { paymentIntentId, cardLast4: cleanNumber.slice(-4) },
            responseData: { status: confirmed.status },
          });
          throw new BadRequestException(
            `Card authorization status: ${confirmed.status}. Payment was not completed.`
          );
        }

        verifiedChargeId = (confirmed.latest_charge as string) || `ch_${confirmed.id}`;
        intentId = confirmed.id;

        await this.recordStripeLog({
          eventType: 'CONFIRM_DIRECT_CARD',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'SUCCESS',
          amount: Number(order.total),
          currency: order.currency,
          requestData: { paymentIntentId, cardLast4: cleanNumber.slice(-4), cardExp: `${expMonth}/${expYear}` },
          responseData: confirmed,
        });
      } catch (stripeErr: any) {
        this.logger.error(`Stripe payment failure for Order #${order.order_number}: ${stripeErr.message}`);
        await this.recordStripeLog({
          eventType: 'CONFIRM_DIRECT_CARD',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'FAILED',
          amount: Number(order.total),
          currency: order.currency,
          errorCode: stripeErr.code || stripeErr.decline_code || stripeErr.type || 'CARD_DECLINED',
          errorMessage: stripeErr.message,
          requestData: { paymentIntentId, cardLast4: cleanNumber.slice(-4) },
          responseData: stripeErr.raw || stripeErr,
        });
        throw new BadRequestException(stripeErr.message || 'Payment card declined by issuer. Please check details or use another card.');
      }
    } else if (paymentIntentId) {
      // Check existing PaymentIntent status directly with Stripe
      try {
        const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status === 'requires_confirmation') {
          const confirmedIntent = await stripeClient.paymentIntents.confirm(paymentIntentId);
          if (confirmedIntent.status !== 'succeeded') {
            await this.recordStripeLog({
              eventType: 'CONFIRM_PAYMENT_INTENT',
              orderId: order.id,
              customerId: order.customer_id,
              status: 'FAILED',
              amount: Number(order.total),
              currency: order.currency,
              errorCode: 'STATUS_NOT_SUCCEEDED',
              errorMessage: `Stripe PaymentIntent status is ${confirmedIntent.status}, not succeeded.`,
              responseData: { status: confirmedIntent.status },
            });
            throw new BadRequestException(`Stripe PaymentIntent status is ${confirmedIntent.status}, not succeeded.`);
          }
          verifiedChargeId = (confirmedIntent.latest_charge as string) || `ch_${confirmedIntent.id}`;
          intentId = confirmedIntent.id;
        } else if (paymentIntent.status === 'succeeded') {
          verifiedChargeId = (paymentIntent.latest_charge as string) || `ch_${paymentIntent.id}`;
          intentId = paymentIntent.id;
        } else {
          await this.recordStripeLog({
            eventType: 'CONFIRM_PAYMENT_INTENT',
            orderId: order.id,
            customerId: order.customer_id,
            status: 'FAILED',
            amount: Number(order.total),
            currency: order.currency,
            errorCode: 'STATUS_NOT_SUCCEEDED',
            errorMessage: `Stripe payment is not completed (current status: ${paymentIntent.status}).`,
            responseData: { status: paymentIntent.status },
          });
          throw new BadRequestException(`Stripe payment is not completed (current status: ${paymentIntent.status}).`);
        }

        await this.recordStripeLog({
          eventType: 'CONFIRM_PAYMENT_INTENT',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'SUCCESS',
          amount: Number(order.total),
          currency: order.currency,
          requestData: { paymentIntentId },
          responseData: { intentId, chargeId: verifiedChargeId, status: paymentIntent.status },
        });
      } catch (stripeErr: any) {
        await this.recordStripeLog({
          eventType: 'CONFIRM_PAYMENT_INTENT',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'FAILED',
          amount: Number(order.total),
          currency: order.currency,
          errorCode: stripeErr.code || stripeErr.type || 'PAYMENT_INTENT_ERROR',
          errorMessage: stripeErr.message,
          requestData: { paymentIntentId },
        });
        throw new BadRequestException(stripeErr.message || 'Unable to verify Stripe payment intent.');
      }
    } else {
      throw new BadRequestException('Card details or valid Stripe Payment Intent ID is required.');
    }

    // Only reached if Stripe confirmed payment status as 'succeeded'!
    await this.confirmPayment(
      order.id,
      intentId,
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
      message: 'Payment verified and order confirmed directly via Stripe.',
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

  async customerCancelOrder(customerId: string, orderId: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.customer_id !== customerId) {
      throw new NotFoundException('Order not found or unauthorized access');
    }

    if (order.status === order_status.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    // If order was already paid, require live chat support
    if (order.payment_method !== payment_method.CASH_ON_DELIVERY && order.payment_status === payment_status.PAID) {
      throw new BadRequestException('Paid orders cannot be self-cancelled. Please contact support via live chat for cancellation and refund.');
    }

    if (order.status !== order_status.PENDING && order.status !== order_status.CONFIRMED) {
      throw new BadRequestException(`Order with status ${order.status} cannot be cancelled directly. Please contact support via live chat.`);
    }

    await this.cancelPayment(orderId);

    return {
      message: 'Order has been cancelled successfully',
      order_id: orderId,
      status: order_status.CANCELLED,
    };
  }

  /**
   * Automatically cancels any Stripe order that remains in unpaid (PENDING) status
   * after 30 minutes, restoring the reserved inventory.
   */
  async cancelExpiredUnpaidOrders(): Promise<number> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const expiredOrders = await this.prisma.orders.findMany({
      where: {
        payment_method: payment_method.STRIPE,
        payment_status: payment_status.PENDING,
        status: order_status.PENDING,
        created_at: { lt: thirtyMinutesAgo },
      },
      select: { id: true, order_number: true, customer_id: true },
    });

    if (expiredOrders.length === 0) return 0;

    let cancelledCount = 0;
    for (const exp of expiredOrders) {
      try {
        await this.cancelPayment(exp.id);
        await this.recordStripeLog({
          eventType: 'ORDER_EXPIRED_CANCELLED',
          orderId: exp.id,
          customerId: exp.customer_id,
          status: 'FAILED',
          errorMessage: `Order #${exp.order_number} automatically cancelled because payment was not completed within 30 minutes.`,
        });
        cancelledCount++;
        this.logger.log(`Auto-cancelled expired unpaid Stripe order #${exp.order_number} after 30 minutes.`);
      } catch (err: any) {
        this.logger.error(`Error auto-cancelling order #${exp.order_number}: ${err.message}`);
      }
    }

    return cancelledCount;
  }

  /**
   * Verifies Stripe Checkout Session, marks order as CONFIRMED/PAID,
   * deducts physical inventory, and sends confirmation emails to customer and admin.
   */
  async verifyStripeSession(sessionId: string, orderId?: string) {
    const stripeClient = await this.getStripeClient();
    const session = await stripeClient.checkout.sessions.retrieve(sessionId);

    const targetOrderId = orderId || session.client_reference_id || (session.metadata?.order_id as string);
    if (!targetOrderId) {
      throw new BadRequestException('Order ID could not be identified from Stripe session.');
    }

    const order = await this.prisma.orders.findUnique({
      where: { id: targetOrderId },
      include: { customer: true, items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order not found for ID: ${targetOrderId}`);
    }

    if (session.payment_status === 'paid') {
      if (order.payment_status !== payment_status.PAID) {
        await this.prisma.$transaction(async (tx) => {
          await tx.orders.update({
            where: { id: order.id },
            data: {
              status: order_status.CONFIRMED,
              payment_status: payment_status.PAID,
            },
          });

          await tx.payments.updateMany({
            where: { order_id: order.id },
            data: {
              status: payment_status.PAID,
              paid_at: new Date(),
              provider_charge_id: (session.payment_intent as string) || session.id,
              response_json: {
                session_id: session.id,
                payment_intent: session.payment_intent,
                status: session.status,
                payment_status: session.payment_status,
              } as any,
            },
          });

          // Physically deduct stock and release reservation
          for (const item of order.items) {
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

                await tx.inventory_transactions.create({
                  data: {
                    variant_id: item.variant_id,
                    type: inventory_transaction_type.SALE,
                    quantity: -toDeduct,
                    reference_type: 'ORDER_FULFILLED',
                    reference_id: order.id,
                  },
                });

                remainingToDeduct -= toDeduct;
              }
            }
          }
        });

        await this.recordStripeLog({
          eventType: 'CHECKOUT_SESSION_PAID',
          orderId: order.id,
          customerId: order.customer_id,
          status: 'SUCCESS',
          amount: Number(order.total),
          currency: order.currency,
          responseData: session,
        });

        // Send confirmation email to customer & notification to admin
        try {
          if (order.customer?.email) {
            await this.mailService.sendOrderConfirmation(
              order.customer.email,
              order.customer.first_name,
              order,
            );
          }
          await this.mailService.sendAdminNewOrderNotification(order);

          await this.notificationsService.createNotification({
            type: 'ORDER',
            title: 'Customer Order Paid (Card)',
            message: `Order #${order.order_number} confirmed with card payment (${order.currency} ${order.total})`,
            link: `/admin/orders/${order.id}`,
            metadata: {
              order_id: order.id,
              order_number: order.order_number,
              total: order.total,
              currency: order.currency,
              customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
            },
          });
        } catch (mailErr: any) {
          this.logger.warn(`Failed to dispatch confirmation email: ${mailErr.message}`);
        }
      }

      return {
        success: true,
        paid: true,
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        currency: order.currency,
      };
    }

    return {
      success: false,
      paid: false,
      status: session.payment_status,
      order_id: order.id,
      order_number: order.order_number,
    };
  }

  /**
   * Generates a new Stripe Checkout Session for an existing unpaid order (Retry Payment flow).
   */
  async createStripeCheckoutSessionForOrder(orderId: string, origin?: string) {
    await this.cancelExpiredUnpaidOrders();

    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === order_status.CANCELLED) {
      throw new BadRequestException('This order has expired or has already been cancelled.');
    }

    if (order.payment_status === payment_status.PAID) {
      throw new BadRequestException('This order has already been paid.');
    }

    // Enforce 30-minute rule
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (ageMs > 30 * 60 * 1000) {
      await this.cancelPayment(order.id);
      throw new BadRequestException('The 30-minute payment window has expired. This order has been cancelled.');
    }

    const stripeClient = await this.getStripeClient();
    const stripeAmount = Math.max(50, Math.round(Number(order.total) * 100));

    const storeUrl =
      (origin && origin.trim()) ||
      (await this.siteSettingsService.getSetting('STOREFRONT_URL')) ||
      process.env.STOREFRONT_URL ||
      'http://localhost:3000';

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: order.currency.toLowerCase(),
            product_data: {
              name: `Saba Al Wadi - Order #${order.order_number}`,
              description: `${order.items.length} luxury garment(s)`,
            },
            unit_amount: stripeAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: order.customer?.email || undefined,
      client_reference_id: order.id,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        customer_id: order.customer_id,
        currency: order.currency,
        base_total_aed: order.total.toString(),
      },
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      success_url: `${storeUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
      cancel_url: `${storeUrl}/checkout/payment-retry?order_id=${order.id}&cancelled=true`,
    });

    await this.prisma.payments.updateMany({
      where: { order_id: order.id },
      data: {
        provider_payment_intent: session.id,
        response_json: { session_id: session.id, checkout_url: session.url } as any,
      },
    });

    await this.recordStripeLog({
      eventType: 'CREATE_RETRY_CHECKOUT_SESSION',
      orderId: order.id,
      customerId: order.customer_id,
      status: 'SUCCESS',
      amount: Number(order.total),
      currency: order.currency,
      requestData: { order_id: order.id, amount: stripeAmount, currency: order.currency.toLowerCase() },
      responseData: session,
    });

    return {
      checkout_url: session.url,
      session_id: session.id,
      order_id: order.id,
      order_number: order.order_number,
    };
  }

  /**
   * Converts an unpaid card order into Cash on Delivery (COD) and sends confirmation email.
   */
  async switchOrderToCod(orderId: string) {
    await this.cancelExpiredUnpaidOrders();

    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === order_status.CANCELLED) {
      throw new BadRequestException('This order has already been cancelled.');
    }

    if (order.payment_status === payment_status.PAID) {
      throw new BadRequestException('This order is already paid.');
    }

    const hasCodDisabledItem = order.items.some(
      (item) => item.variant?.product?.is_cod_allowed === false,
    );
    if (hasCodDisabledItem) {
      throw new BadRequestException(
        'Cash on Delivery is unavailable because one or more items in this order require online payment.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const ord = await tx.orders.update({
        where: { id: orderId },
        data: {
          payment_method: payment_method.CASH_ON_DELIVERY,
          payment_status: payment_status.PENDING,
          status: order_status.PENDING,
        },
        include: { customer: true, items: true },
      });

      await tx.payments.updateMany({
        where: { order_id: orderId },
        data: {
          provider: 'CASH_ON_DELIVERY',
          provider_payment_intent: `COD-${ord.order_number}`,
          status: payment_status.PENDING,
        },
      });

      return ord;
    });

    // Send COD confirmation email
    try {
      if (updated.customer?.email) {
        await this.mailService.sendOrderConfirmation(
          updated.customer.email,
          updated.customer.first_name,
          updated,
        );
      }
      await this.mailService.sendAdminNewOrderNotification(updated);
    } catch (err: any) {
      this.logger.warn(`Failed to send COD confirmation email: ${err.message}`);
    }

    return {
      success: true,
      order_number: updated.order_number,
      payment_method: 'CASH_ON_DELIVERY',
    };
  }

  /**
   * Retrieves payment status, countdown timer details, and order info for retry page.
   */
  async getOrderPaymentStatus(orderId: string) {
    await this.cancelExpiredUnpaidOrders();

    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        order_number: true,
        status: true,
        payment_status: true,
        payment_method: true,
        total: true,
        subtotal: true,
        shipping: true,
        discount: true,
        currency: true,
        created_at: true,
        items: {
          select: {
            id: true,
            product_name: true,
            variant_name: true,
            price: true,
            quantity: true,
            subtotal: true,
            sku: true,
          },
        },
        customer: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const ageMs = Date.now() - new Date(order.created_at).getTime();
    const maxWindowMs = 30 * 60 * 1000;
    const remainingSeconds = Math.max(0, Math.floor((maxWindowMs - ageMs) / 1000));
    const isExpired = ageMs > maxWindowMs && order.payment_status === payment_status.PENDING;

    if (isExpired && order.status !== order_status.CANCELLED) {
      await this.cancelPayment(order.id);
      order.status = order_status.CANCELLED;
      order.payment_status = payment_status.FAILED;
    }

    return {
      ...order,
      age_ms: ageMs,
      remaining_seconds: remainingSeconds,
      is_expired: isExpired || order.status === order_status.CANCELLED,
    };
  }

  // --- NUMBER GENERATION HELPERS ---

  /**
   * Generates sequential order numbers in the format SW<YYYY>00001, SW<YYYY>00002...
   * The year is dynamically based on current year, and resets back to 00001 on each new year.
   */
  async generateOrderNumber(tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const currentYear = new Date().getFullYear();
    const yearPrefix = `SW${currentYear}`;

    // Find the highest order number for the current year
    const lastOrder = await client.orders.findFirst({
      where: {
        order_number: {
          startsWith: yearPrefix,
        },
      },
      orderBy: {
        order_number: 'desc',
      },
      select: {
        order_number: true,
      },
    });

    let nextCounter = 1;
    let padLength = 5; // Default 5 digits (00001) as requested by user

    if (lastOrder && lastOrder.order_number) {
      const seqStr = lastOrder.order_number.slice(yearPrefix.length);
      const parsed = parseInt(seqStr, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        nextCounter = parsed + 1;
        padLength = Math.max(seqStr.length, 5);
      }
    }

    const formattedSeq = String(nextCounter).padStart(padLength, '0');
    return `${yearPrefix}${formattedSeq}`;
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
            select: { first_name: true, last_name: true, email: true, phone: true },
          },
          items: {
            include: {
              variant: {
                include: {
                  images: true,
                  attributes: {
                    include: {
                      attribute_value: {
                        include: { attribute: true },
                      },
                    },
                  },
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
                attributes: {
                  include: {
                    attribute_value: {
                      include: { attribute: true },
                    },
                  },
                },
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
        customer: true,
        items: {
          include: {
            variant: {
              include: {
                images: true,
                attributes: {
                  include: {
                    attribute_value: {
                      include: { attribute: true },
                    },
                  },
                },
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

    if (dto.notify_customer && updated.customer?.email) {
      try {
        const hasTracking = Boolean(updated.tracking_number || updated.delivery_partner);
        const isTrackingUpdate = Boolean(dto.tracking_number || dto.delivery_partner || dto.tracking_url);

        if (hasTracking && (!dto.status || isTrackingUpdate)) {
          // Specifically notify tracking number & courier
          await this.mailService.sendTrackingNotificationEmail(
            updated.customer.email,
            updated.customer.first_name || 'Customer',
            updated.order_number,
            updated.delivery_partner || undefined,
            updated.tracking_number || undefined,
            updated.tracking_url || undefined,
            updated.delivery_notes || undefined,
          );
        } else if (dto.status) {
          await this.mailService.sendOrderStatusUpdateEmail(
            updated.customer.email,
            updated.customer.first_name || 'Customer',
            updated.order_number,
            updated.status,
            updated.delivery_partner || undefined,
            updated.tracking_number || undefined,
            updated.tracking_url || undefined,
          );
        }
      } catch (err: any) {
        this.logger.error(`Failed to send order email to ${updated.customer?.email}: ${err.message}`);
      }
    }

    return updated;
  }

  async sendTrackingEmailToCustomer(orderId: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    if (!order.customer?.email) {
      throw new BadRequestException('Order does not have a customer email address on file');
    }
    if (!order.tracking_number && !order.delivery_partner) {
      throw new BadRequestException('Please add a tracking number or delivery partner first');
    }

    const sent = await this.mailService.sendTrackingNotificationEmail(
      order.customer.email,
      order.customer.first_name,
      order.order_number,
      order.delivery_partner || undefined,
      order.tracking_number || undefined,
      order.tracking_url || undefined,
      order.delivery_notes || undefined,
    );

    return {
      success: sent,
      message: `Tracking details emailed successfully to ${order.customer.email}`,
    };
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
        const fullAddr = (dto.address.full_address || 'Manual Order Address').trim();
        await tx.customer_addresses.create({
          data: {
            customer_id: customerId,
            country: dto.address.country || 'UAE',
            phone: dto.customer_phone || dto.address.phone || '+971 50 000 0000',
            city: dto.address.city || 'Dubai',
            postal_code: dto.address.postal_code || '00000',
            full_address: fullAddr,
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
          shipping_phone: dto.customer_phone || dto.address?.phone || null,
          shipping_city: dto.address?.city || 'Dubai',
          shipping_postal_code: dto.address?.postal_code || '00000',
          shipping_full_address: (dto.address?.full_address || 'Manual Order Address').trim(),
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
          currency: dto.currency || order.currency,
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

    // Only allow address change if order is in PENDING, CONFIRMED, or PACKED status
    const editableStatuses: string[] = [order_status.PENDING, order_status.CONFIRMED, order_status.PACKED];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Delivery address cannot be updated when order is ${order.status}. Changes are only allowed for Pending, Confirmed, or Packed orders.`
      );
    }

    const dataToUpdate: any = {};
    if (dto.country !== undefined) dataToUpdate.shipping_country = dto.country?.trim() || null;
    if (dto.phone !== undefined) dataToUpdate.shipping_phone = dto.phone?.trim() || null;
    if (dto.city !== undefined) dataToUpdate.shipping_city = dto.city?.trim() || null;
    if (dto.postal_code !== undefined) dataToUpdate.shipping_postal_code = dto.postal_code?.trim() || null;
    const resolvedFullAddress = dto.full_address !== undefined
      ? dto.full_address?.trim()
      : undefined;
    if (resolvedFullAddress !== undefined) {
      dataToUpdate.shipping_full_address = resolvedFullAddress;
    }

    await this.prisma.orders.update({
      where: { id },
      data: dataToUpdate,
    });

    if (dto.phone && dto.phone.trim() && order.customer_id) {
      await this.prisma.customers.update({
        where: { id: order.customer_id },
        data: { phone: dto.phone.trim() },
      }).catch(() => {});
    }

    return this.findOne(id);
  }

  async customerUpdateOrderAddress(customerId: string, id: string, dto: UpdateOrderAddressDto) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.customer_id !== customerId) {
      throw new BadRequestException('Unauthorized access to update this order');
    }

    // Only allow address change if order is in PENDING, CONFIRMED, or PACKED status
    const editableStatuses: string[] = [order_status.PENDING, order_status.CONFIRMED, order_status.PACKED];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Delivery address cannot be updated at this stage. Order is already "${order.status}". Address changes are only allowed for Pending, Confirmed, or Packed orders.`
      );
    }

    const dataToUpdate: any = {};
    if (dto.country !== undefined) dataToUpdate.shipping_country = dto.country?.trim() || null;
    if (dto.phone !== undefined) dataToUpdate.shipping_phone = dto.phone?.trim() || null;
    if (dto.city !== undefined) dataToUpdate.shipping_city = dto.city?.trim() || null;
    if (dto.postal_code !== undefined) dataToUpdate.shipping_postal_code = dto.postal_code?.trim() || null;
    const resolvedFullAddress = dto.full_address !== undefined
      ? dto.full_address?.trim()
      : undefined;
    if (resolvedFullAddress !== undefined) {
      dataToUpdate.shipping_full_address = resolvedFullAddress;
    }

    await this.prisma.orders.update({
      where: { id },
      data: dataToUpdate,
    });

    if (dto.phone && dto.phone.trim()) {
      await this.prisma.customers.update({
        where: { id: customerId },
        data: { phone: dto.phone.trim() },
      }).catch(() => {});
    }

    return this.findOne(id);
  }

  async onModuleInit() {
    // 1. Seed delivery partners if empty
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

    // 2. Clean up expired unpaid Stripe orders immediately and periodically every 2 minutes
    this.cancelExpiredUnpaidOrders().catch(() => {});
    setInterval(() => {
      this.cancelExpiredUnpaidOrders().catch(() => {});
    }, 2 * 60 * 1000);
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

  async sendInvoiceEmail(
    orderId: string,
    body: {
      recipient_email?: string;
      subject?: string;
      message?: string;
      mode?: 'BODY' | 'ATTACHMENT' | 'BOTH';
      invoice_html?: string;
    },
  ) {
    const order = await this.findOne(orderId);
    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    const recipient = (
      body.recipient_email ||
      order.customer?.email ||
      (order as any).shipping_email ||
      ''
    ).trim();

    if (!recipient || !recipient.includes('@')) {
      throw new BadRequestException('A valid recipient email address is required');
    }

    const mode = body.mode || 'BOTH';
    const orderNumber = order.order_number || order.id;
    const subject =
      (body.subject && body.subject.trim()) ||
      `Official Invoice for Order #${orderNumber} - Saba Al Wadi Couture Atelier`;

    const customerName =
      `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() ||
      'Valued Customer';

    const defaultMessage = `Dear ${customerName},

Thank you for choosing Saba Al Wadi Couture Atelier. Please find your official invoice for Order #${orderNumber} attached and detailed below.

If you have any questions or require custom tailoring adjustments, please reply to this email or contact our atelier concierge.

Warm regards,
Saba Al Wadi Couture Atelier
Dubai, United Arab Emirates`;

    const messageText = body.message !== undefined && body.message !== null ? body.message : defaultMessage;
    const formattedMessageHtml = messageText
      .split('\n')
      .map((line) => line.trim())
      .map((line) => (line ? `<p style="margin: 0 0 10px 0; line-height: 1.6; font-size: 14px; color: #374151;">${line}</p>` : '<div style="height: 8px;"></div>'))
      .join('');

    let invoiceHtml = body.invoice_html || '';
    if (!invoiceHtml) {
      invoiceHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 20px auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; background: #ffffff;">
          <h2 style="color: #30206b; margin-top: 0;">SABA AL WADI HAUTE COUTURE</h2>
          <p><strong>Order Number:</strong> #${orderNumber}</p>
          <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${order.status}</p>
          <p><strong>Total Amount:</strong> ${order.currency || 'AED'} ${Number(order.total).toFixed(2)}</p>
        </div>
      `;
    }

    let emailBodyHtml = '';
    const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

    const logoSetting = await this.prisma.site_settings.findUnique({ where: { key: 'logo_url' } });
    const siteLogoUrl = logoSetting?.value?.trim() || 'https://media.sabaalwadi.com/saba-media/website_settings_files/1777029127576-390261898.png';

    const emailContainerHeader = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827;">
        <div style="max-width: 700px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Brand Header -->
          <div style="background-color: #0c0a09; padding: 24px 30px; text-align: center; border-bottom: 2px solid #292524;">
            <img src="${siteLogoUrl}" alt="Saba Al Wadi" style="max-height: 48px; width: auto; max-width: 220px; display: block; margin: 0 auto;" />
          </div>
          <!-- Message Content -->
          <div style="padding: 28px 30px 20px 30px;">
            ${formattedMessageHtml}
          </div>
    `;

    const emailContainerFooter = `
          <!-- Footer -->
          <div style="background-color: #f3f4f6; padding: 18px 30px; text-align: center; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #374151;">Saba Al Wadi Couture Atelier LLC</p>
            <p style="margin: 0;">Dubai, United Arab Emirates • Customer Concierge Support</p>
          </div>
        </div>
      </body>
      </html>
    `;

    if (mode === 'BODY') {
      emailBodyHtml = `
        ${emailContainerHeader}
        <div style="padding: 0 30px 28px 30px; border-top: 1px solid #f3f4f6;">
          <div style="margin: 16px 0; font-weight: 700; color: #30206b; font-size: 15px;">Official Invoice Copy</div>
          ${invoiceHtml}
        </div>
        ${emailContainerFooter}
      `;
    } else if (mode === 'ATTACHMENT') {
      emailBodyHtml = `
        ${emailContainerHeader}
        <div style="padding: 16px 30px 24px 30px; background-color: #fefce8; border-top: 1px solid #fef08a; border-bottom: 1px solid #fef08a; margin: 0 0 20px 0;">
          <p style="margin: 0; font-size: 13px; color: #854d0e; font-weight: 500;">
            📎 Your official tax invoice for Order <strong>#${orderNumber}</strong> is attached to this email as <strong>Invoice-${orderNumber}.html</strong>. You can open and print it in any browser.
          </p>
        </div>
        ${emailContainerFooter}
      `;
      attachments.push({
        filename: `Invoice-${orderNumber}.html`,
        content: invoiceHtml,
        contentType: 'text/html',
      });
    } else {
      // BOTH
      emailBodyHtml = `
        ${emailContainerHeader}
        <div style="padding: 14px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 12px; color: #475569;">
            📎 An interactive printable copy of your invoice is also attached as <strong>Invoice-${orderNumber}.html</strong>.
          </p>
        </div>
        <div style="padding: 0 30px 28px 30px;">
          ${invoiceHtml}
        </div>
        ${emailContainerFooter}
      `;
      attachments.push({
        filename: `Invoice-${orderNumber}.html`,
        content: invoiceHtml,
        contentType: 'text/html',
      });
    }

    const result = await this.mailService.dispatchMail({
      to: recipient,
      subject,
      html: emailBodyHtml,
      text: messageText,
      attachments,
    });

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to dispatch invoice email via SMTP');
    }

    return {
      success: true,
      message: `Invoice email successfully sent to ${recipient} (${mode.toLowerCase()} mode)`,
      recipient,
      mode,
    };
  }
}

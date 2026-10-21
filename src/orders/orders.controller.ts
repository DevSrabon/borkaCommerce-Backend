import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, Headers, BadRequestException, Delete, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto, UpdateOrderStatusDto, CreateManualOrderDto, UpdateOrderItemsDto, UpdateOrderAddressDto } from './dto/orders.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  // --- STOREFRONT ROUTES ---

  @UseGuards(AuthGuard)
  @Post('ecommerce/orders/checkout')
  checkout(@CurrentUser() customer: any, @Body() checkoutDto: CheckoutDto) {
    return this.ordersService.checkout(customer.id, checkoutDto);
  }

  @UseGuards(AuthGuard)
  @Get('ecommerce/orders/my-orders')
  getMyOrders(@CurrentUser() customer: any) {
    return this.ordersService.findByCustomer(customer.id);
  }

  @UseGuards(AuthGuard)
  @Get('ecommerce/orders/:id')
  async getMyOrderDetails(@Param('id') id: string, @CurrentUser() customer: any) {
    const order = await this.ordersService.findOne(id);
    if (order.customer_id !== customer.id) {
      throw new BadRequestException('Unauthorized access to order details');
    }
    return order;
  }

  @UseGuards(AuthGuard)
  @Patch('ecommerce/orders/:id/cancel')
  async cancelMyOrder(@Param('id') id: string, @CurrentUser() customer: any) {
    return this.ordersService.customerCancelOrder(customer.id, id);
  }

  @UseGuards(AuthGuard)
  @Patch('ecommerce/orders/:id/address')
  async updateMyOrderAddress(
    @Param('id') id: string,
    @CurrentUser() customer: any,
    @Body() updateOrderAddressDto: UpdateOrderAddressDto,
  ) {
    return this.ordersService.customerUpdateOrderAddress(customer.id, id, updateOrderAddressDto);
  }

  // --- STRIPE DIRECT CONFIRMATION (Legacy Fallback) ---
  @Post('ecommerce/orders/confirm-stripe')
  async confirmStripeDirect(
    @Body()
    body: {
      order_id: string;
      payment_intent_id?: string;
      card?: {
        number: string;
        exp_month: string | number;
        exp_year: string | number;
        cvc: string;
        name?: string;
      };
    },
  ) {
    if (!body?.order_id) {
      throw new BadRequestException('order_id is required');
    }
    return this.ordersService.confirmStripeDirect(body.order_id, body.payment_intent_id, body.card);
  }

  // --- STRIPE CHECKOUT SESSION VERIFICATION (Redirect return) ---
  @Post('ecommerce/orders/verify-stripe-session')
  async verifyStripeSession(
    @Body() body: { session_id: string; order_id?: string },
  ) {
    if (!body?.session_id) {
      throw new BadRequestException('session_id is required');
    }
    return this.ordersService.verifyStripeSession(body.session_id, body.order_id);
  }

  // --- RETRY STRIPE PAYMENT FOR UNPAID ORDER ---
  @Post('ecommerce/orders/:id/retry-stripe')
  async retryStripePayment(
    @Param('id') id: string,
    @Body() body: { origin?: string },
  ) {
    return this.ordersService.createStripeCheckoutSessionForOrder(id, body?.origin);
  }

  // --- SWITCH UNPAID ORDER TO CASH ON DELIVERY ---
  @Post('ecommerce/orders/:id/switch-to-cod')
  async switchOrderToCod(@Param('id') id: string) {
    return this.ordersService.switchOrderToCod(id);
  }

  // --- GET ORDER PAYMENT STATUS (For retry page & countdown) ---
  @Get('ecommerce/orders/:id/payment-status')
  async getOrderPaymentStatus(@Param('id') id: string) {
    return this.ordersService.getOrderPaymentStatus(id);
  }

  // --- STRIPE WEBHOOK ---
  @Post('ecommerce/orders/stripe-webhook')
  async stripeWebhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body for webhook validation');
    }

    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || 'whsec_mock';
    return this.ordersService.handleStripeWebhook(rawBody, signature, secret);
  }

  // --- ADMIN ROUTES ---

  @UseGuards(AdminGuard)
  @Get('admin/orders')
  async findAllAdmin(
    @Query('status') status?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.ordersService.findAll(status, startDate, endDate, search, limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Post('admin/orders/:id/generate-production-no')
  generateProductionNo(@Param('id') id: string) {
    return this.ordersService.generateProductionNoForOrder(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/orders/:id/send-invoice')
  sendInvoiceEmail(
    @Param('id') id: string,
    @Body()
    body: {
      recipient_email?: string;
      subject?: string;
      message?: string;
      mode?: 'BODY' | 'ATTACHMENT' | 'BOTH';
      invoice_html?: string;
    },
  ) {
    return this.ordersService.sendInvoiceEmail(id, body);
  }

  @UseGuards(AdminGuard)
  @Post('admin/orders/:id/send-tracking-email')
  sendTrackingEmail(@Param('id') id: string) {
    return this.ordersService.sendTrackingEmailToCustomer(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/orders/manual')
  createManualOrder(@Body() createManualOrderDto: CreateManualOrderDto) {
    return this.ordersService.createManualOrder(createManualOrderDto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/orders/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/orders/:id')
  updateOrderStatus(@Param('id') id: string, @Body() updateOrderStatusDto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, updateOrderStatusDto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/orders/:id/items')
  updateOrderItems(@Param('id') id: string, @Body() updateOrderItemsDto: UpdateOrderItemsDto) {
    return this.ordersService.updateOrderItems(id, updateOrderItemsDto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/orders/:id/address')
  updateOrderAddress(@Param('id') id: string, @Body() updateOrderAddressDto: UpdateOrderAddressDto) {
    return this.ordersService.updateOrderAddress(id, updateOrderAddressDto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/orders/:id')
  removeOrder(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }

  // --- DELIVERY PARTNERS / COURIERS ---

  @Get('ecommerce/delivery-partners')
  async getDeliveryPartnersPublic() {
    const { items } = await this.ordersService.getDeliveryPartners();
    return items;
  }

  @UseGuards(AdminGuard)
  @Get('admin/delivery-partners')
  async getDeliveryPartnersAdmin(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.ordersService.getDeliveryPartners(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @UseGuards(AdminGuard)
  @Post('admin/delivery-partners')
  createDeliveryPartner(@Body() body: { name: string; tracking_url_template?: string; contact_phone?: string }) {
    return this.ordersService.createDeliveryPartner(body);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/delivery-partners/:id')
  updateDeliveryPartner(
    @Param('id') id: string,
    @Body() body: { name?: string; tracking_url_template?: string; contact_phone?: string; is_active?: boolean },
  ) {
    return this.ordersService.updateDeliveryPartner(id, body);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/delivery-partners/:id')
  deleteDeliveryPartner(@Param('id') id: string) {
    return this.ordersService.deleteDeliveryPartner(id);
  }
}

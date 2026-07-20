import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, Headers, BadRequestException, Delete } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/orders.dto';
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
  findAllAdmin() {
    return this.ordersService.findAll();
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
  @Delete('admin/orders/:id')
  removeOrder(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}

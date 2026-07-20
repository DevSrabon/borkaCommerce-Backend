import { Controller, Get, Post, Body, UseGuards, Delete, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('ecommerce/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@CurrentUser() customer: any) {
    return {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      email_verified: customer.email_verified,
    };
  }

  // --- ADMIN CUSTOMER MANAGEMENT ROUTES ---

  @UseGuards(AdminGuard)
  @Get('/admin/customers')
  findAllCustomers() {
    return this.authService.findAllCustomers();
  }

  @UseGuards(AdminGuard)
  @Delete('/admin/customers/:id')
  removeCustomer(@Param('id') id: string) {
    return this.authService.removeCustomer(id);
  }
}

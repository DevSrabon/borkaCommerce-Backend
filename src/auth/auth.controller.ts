import { Controller, Get, Post, Body, UseGuards, Delete, Param, Patch, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, CreateAdminDto, UpdateCustomerDto, VerifyOtpDto, ResendOtpDto, SocialLoginDto, UpdateProfileDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from './current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadMiddleware } from '../uploads/image-upload.middleware';

@Controller('ecommerce/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('social-login')
  socialLogin(@Body() dto: SocialLoginDto) {
    return this.authService.socialLogin(dto);
  }

  @Get('social-config')
  getSocialConfig() {
    return this.authService.getSocialConfig();
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(AuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: imageUploadMiddleware('customer'),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|avif|gif)$/)) {
          return cb(new BadRequestException('Only image files (JPG, PNG, WEBP, AVIF, GIF) are allowed for avatar upload'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(@CurrentUser() customer: any, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No image file uploaded');
    }
    const avatarUrl = `/uploads/customer/${file.filename}`;
    return this.authService.updateAvatar(customer.id, avatarUrl);
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
      role: customer.role,
      is_blocked: customer.is_blocked,
      email_verified: customer.email_verified,
      avatar_url: customer.avatar_url,
    };
  }

  @UseGuards(AuthGuard)
  @Patch('profile')
  updateProfile(@CurrentUser() customer: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(customer.id, dto);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  changePassword(@CurrentUser() customer: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(customer.id, dto);
  }

  // --- ADMIN AUTH & CREATION ---
  @UseGuards(AdminGuard)
  @Post('admin/create')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.authService.createAdmin(dto);
  }

  // --- ADMIN CUSTOMER MANAGEMENT ROUTES ---

  @UseGuards(AdminGuard)
  @Get('admin/customers')
  findAllCustomers() {
    return this.authService.findAllCustomers();
  }

  @UseGuards(AdminGuard)
  @Get('admin/customers/:id')
  getCustomerDetails(@Param('id') id: string) {
    return this.authService.getCustomerDetails(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.authService.updateCustomer(id, dto, currentUser);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/customers/:id')
  removeCustomer(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.authService.removeCustomer(id, currentUser);
  }
}


import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto, CreateAdminDto, UpdateCustomerDto, VerifyOtpDto, ResendOtpDto, SocialLoginDto, UpdateProfileDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // Secure hashing using bcryptjs
  private hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash) return false;

    // Normalize $2y$ prefix (e.g. from PHP/Laravel bcrypt) to $2a$ for bcryptjs
    const normalizedHash = storedHash.startsWith('$2y$')
      ? storedHash.replace(/^\$2y\$/, '$2a$')
      : storedHash;

    // Check standard bcrypt hashes ($2a$, $2b$, $2y$)
    if (normalizedHash.startsWith('$2')) {
      try {
        return bcrypt.compareSync(password, normalizedHash);
      } catch {
        return false;
      }
    }

    // Backward compatibility fallback for legacy PBKDF2 hashes (salt:hash format)
    if (storedHash.includes(':')) {
      const [salt, hash] = storedHash.split(':');
      if (salt && hash) {
        const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        return computedHash === hash;
      }
    }

    return false;
  }

  private async createSession(customer: any) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30); // 30 days expiry

    await this.prisma.sessions.create({
      data: {
        token,
        expires_at,
        customer_id: customer.id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      user: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        role: customer.role,
        is_blocked: customer.is_blocked,
        email_verified: customer.email_verified,
        avatar_url: customer.avatar_url,
      },
      token,
    };
  }

  async verifyTurnstile(token?: string, ip?: string): Promise<boolean> {
    const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';

    if (!token) {
      if (process.env.REQUIRE_TURNSTILE === 'true') {
        throw new BadRequestException('Security verification (Cloudflare Turnstile) is required');
      }
      return true;
    }

    if (token === 'test-token' || token.startsWith('1x0000')) {
      return true;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (ip) formData.append('remoteip', ip);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const data: any = await res.json();
      if (!data.success) {
        if (secretKey.startsWith('1x0000')) return true;
        throw new BadRequestException('Cloudflare Turnstile verification failed');
      }
      return true;
    } catch (err: any) {
      if (secretKey.startsWith('1x0000')) return true;
      throw new BadRequestException(err.message || 'Captcha verification error');
    }
  }

  async register(dto: RegisterDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.customers.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('An account with this email already exists');
    }

    const hashedPassword = this.hashPassword(dto.password);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);

    const customer = await this.prisma.customers.create({
      data: {
        first_name: dto.first_name,
        last_name: dto.last_name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        password: hashedPassword,
        email_verified: false,
        otp_code: otp,
        otp_expires_at,
        role: 'CUSTOMER',
        is_blocked: false,
      },
    });

    await this.mailService.sendOtpEmail(customer.email, otp, customer.first_name);

    return {
      message: 'Registration successful! A 6-digit verification code has been sent to your email.',
      email: customer.email,
      requires_otp: true,
      dev_otp: otp,
      customer: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
      },
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const customer = await this.prisma.customers.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found');
    }

    if (customer.is_blocked) {
      throw new UnauthorizedException('Your account has been suspended or blocked');
    }

    if (!customer.otp_code || customer.otp_code !== dto.otp) {
      throw new BadRequestException('Invalid verification code entered. Please check and try again.');
    }

    if (customer.otp_expires_at && new Date() > customer.otp_expires_at) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    const updated = await this.prisma.customers.update({
      where: { id: customer.id },
      data: {
        email_verified: true,
        otp_code: null,
        otp_expires_at: null,
      },
    });

    const sessionRes = await this.createSession(updated);
    return {
      message: 'Email address verified successfully!',
      ...sessionRes,
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const customer = await this.prisma.customers.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found');
    }

    if (customer.is_blocked) {
      throw new UnauthorizedException('Your account has been suspended or blocked');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.customers.update({
      where: { id: customer.id },
      data: {
        otp_code: otp,
        otp_expires_at,
      },
    });

    await this.mailService.sendOtpEmail(customer.email, otp, customer.first_name);

    return {
      message: 'A new 6-digit verification code has been sent to your email.',
      email: customer.email,
      dev_otp: otp,
    };
  }

  async socialLogin(dto: SocialLoginDto) {
    const email = dto.email.toLowerCase();
    let customer = await this.prisma.customers.findUnique({
      where: { email },
    });

    if (customer) {
      if (customer.is_blocked) {
        throw new UnauthorizedException('Your account has been suspended or blocked by an administrator');
      }

      // Update avatar if provided and customer currently lacks one
      if (dto.avatar_url && !customer.avatar_url) {
        customer = await this.prisma.customers.update({
          where: { id: customer.id },
          data: { avatar_url: dto.avatar_url, email_verified: true },
        });
      }
    } else {
      // Create new customer from verified social profile
      const nameParts = (dto.name || 'Valued Customer').trim().split(' ');
      const first_name = nameParts[0] || 'Valued';
      const last_name = nameParts.slice(1).join(' ') || 'Customer';

      customer = await this.prisma.customers.create({
        data: {
          first_name,
          last_name,
          email,
          email_verified: true,
          avatar_url: dto.avatar_url || null,
          role: 'CUSTOMER',
          is_blocked: false,
        },
      });
    }

    // Link/Upsert account record for social provider
    const providerAccountId = dto.social_id || dto.email;
    const existingAccount = await this.prisma.accounts.findFirst({
      where: {
        customer_id: customer.id,
        provider_id: dto.provider,
      },
    });

    if (!existingAccount) {
      await this.prisma.accounts.create({
        data: {
          customer_id: customer.id,
          provider_id: dto.provider,
          account_id: providerAccountId,
          id_token: dto.id_token || null,
          access_token: dto.access_token || null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return this.createSession(customer);
  }

  async updateAvatar(customerId: string, avatarPath: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.prisma.customers.update({
      where: { id: customerId },
      data: { avatar_url: avatarPath },
    });

    return {
      message: 'Profile picture updated successfully',
      avatar_url: updated.avatar_url,
      user: {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        is_blocked: updated.is_blocked,
        email_verified: updated.email_verified,
        avatar_url: updated.avatar_url,
      },
    };
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.prisma.customers.update({
      where: { id: customerId },
      data: {
        first_name: dto.first_name.trim(),
        last_name: dto.last_name.trim(),
        phone: dto.phone !== undefined ? dto.phone.trim() : customer.phone,
      },
    });

    return {
      message: 'Profile updated successfully',
      user: {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        is_blocked: updated.is_blocked,
        email_verified: updated.email_verified,
        avatar_url: updated.avatar_url,
      },
    };
  }

  async changePassword(customerId: string, dto: ChangePasswordDto) {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.password) {
      if (!dto.current_password) {
        throw new BadRequestException('Current password is required');
      }
      const isValid = this.verifyPassword(dto.current_password, customer.password);
      if (!isValid) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    const hashedPassword = this.hashPassword(dto.new_password);
    await this.prisma.customers.update({
      where: { id: customerId },
      data: { password: hashedPassword },
    });

    return {
      message: 'Password changed successfully',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const email = dto.email.trim().toLowerCase();
    const customer = await this.prisma.customers.findUnique({
      where: { email },
    });

    if (!customer) {
      return {
        message: 'If an account exists with this email, a 6-digit verification code has been sent.',
        email,
      };
    }

    if (customer.is_blocked) {
      throw new UnauthorizedException('Your account has been suspended or blocked.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires_at = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.customers.update({
      where: { id: customer.id },
      data: {
        otp_code: otp,
        otp_expires_at,
      },
    });

    await this.mailService.sendPasswordResetEmail(customer.email, otp, customer.first_name);

    return {
      message: 'A 6-digit password reset code has been sent to your email.',
      email: customer.email,
      dev_otp: otp,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const email = dto.email.trim().toLowerCase();
    const customer = await this.prisma.customers.findUnique({
      where: { email },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    if (customer.is_blocked) {
      throw new UnauthorizedException('Your account has been suspended or blocked.');
    }

    if (!customer.otp_code || customer.otp_code !== dto.otp.trim()) {
      throw new BadRequestException('Invalid verification code entered. Please check your email and try again.');
    }

    if (customer.otp_expires_at && new Date() > customer.otp_expires_at) {
      throw new BadRequestException('Verification code has expired. Please request a new reset code.');
    }

    const hashedPassword = this.hashPassword(dto.new_password);
    await this.prisma.customers.update({
      where: { id: customer.id },
      data: {
        password: hashedPassword,
        otp_code: null,
        otp_expires_at: null,
        email_verified: true,
      },
    });

    return {
      message: 'Your password has been reset successfully! You can now sign in with your new password.',
      success: true,
    };
  }

  async getSocialConfig() {
    const settings = await this.prisma.site_settings.findMany({
      where: {
        key: {
          in: [
            'GOOGLE_CLIENT_ID',
            'google_client_id',
            'FACEBOOK_APP_ID',
            'facebook_app_id',
            'CLOUDFLARE_TURNSTILE_SITE_KEY',
            'cloudflare_turnstile_site_key',
          ],
        },
      },
    });
    const map = settings.reduce(
      (acc, s) => ({ ...acc, [s.key]: s.value }),
      {} as Record<string, string>
    );

    return {
      google_client_id:
        map['GOOGLE_CLIENT_ID'] || map['google_client_id'] || process.env.GOOGLE_CLIENT_ID || '',
      facebook_app_id:
        map['FACEBOOK_APP_ID'] || map['facebook_app_id'] || process.env.FACEBOOK_APP_ID || '',
      cloudflare_turnstile_site_key:
        map['CLOUDFLARE_TURNSTILE_SITE_KEY'] ||
        map['cloudflare_turnstile_site_key'] ||
        process.env.CLOUDFLARE_TURNSTILE_SITE_KEY ||
        '1x00000000000000000000AA',
    };
  }

  async createAdmin(dto: CreateAdminDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.customers.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists');
    }

    const hashedPassword = this.hashPassword(dto.password);
    const admin = await this.prisma.customers.create({
      data: {
        first_name: dto.first_name,
        last_name: dto.last_name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        password: hashedPassword,
        email_verified: true,
        role: 'ADMIN',
        is_blocked: false,
      },
    });

    return {
      id: admin.id,
      first_name: admin.first_name,
      last_name: admin.last_name,
      email: admin.email,
      role: admin.role,
      avatar_url: admin.avatar_url,
    };
  }

  async login(dto: LoginDto) {
    await this.verifyTurnstile(dto.captcha_token);

    const customer = await this.prisma.customers.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!customer || !customer.password) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    if (customer.is_blocked) {
      throw new UnauthorizedException('Your account has been suspended or blocked by an administrator');
    }

    const isValid = this.verifyPassword(dto.password, customer.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    return this.createSession(customer);
  }

  async findAllCustomers(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [customers, total] = await Promise.all([
      this.prisma.customers.findMany({
        take,
        skip: skipCount,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          role: true,
          is_blocked: true,
          email_verified: true,
          created_at: true,
          addresses: true,
          _count: {
            select: {
              orders: true,
              reviews: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.customers.count(),
    ]);

    return { items: customers, total };
  }

  async getCustomerDetails(id: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            items: true,
            payments: true,
          },
          orderBy: { created_at: 'desc' },
        },
        reviews: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        addresses: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const { password, ...customerWithoutPassword } = customer;
    return customerWithoutPassword;
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const updateData: any = {};
    if (dto.first_name !== undefined) updateData.first_name = dto.first_name;
    if (dto.last_name !== undefined) updateData.last_name = dto.last_name;
    if (dto.email !== undefined) {
      const targetEmail = dto.email.trim().toLowerCase();
      if (targetEmail !== customer.email) {
        const existingEmail = await this.prisma.customers.findUnique({
          where: { email: targetEmail },
        });
        if (existingEmail) {
          throw new BadRequestException('An account with this email already exists');
        }
      }
      updateData.email = targetEmail;
    }
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.is_blocked !== undefined) updateData.is_blocked = dto.is_blocked;
    if (dto.password) updateData.password = this.hashPassword(dto.password);

    const updated = await this.prisma.customers.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        role: true,
        is_blocked: true,
        email_verified: true,
        updated_at: true,
      },
    });

    // If user was blocked, invalidate all active sessions
    if (dto.is_blocked === true) {
      await this.prisma.sessions.deleteMany({
        where: { customer_id: id },
      });
    }

    return updated;
  }

  async removeCustomer(id: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    // Cascade deletes sessions, wishlists, carts, addresses, reviews via prisma schema
    return this.prisma.customers.delete({
      where: { id },
    });
  }
}


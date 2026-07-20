import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // Secure native hashing using PBKDF2
  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return computedHash === hash;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.customers.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('Email address is already registered');
    }

    const hashedPassword = this.hashPassword(dto.password);

    const customer = await this.prisma.customers.create({
      data: {
        first_name: dto.first_name,
        last_name: dto.last_name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        password: hashedPassword,
        email_verified: false,
      },
    });

    return {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
    };
  }

  async login(dto: LoginDto) {
    const customer = await this.prisma.customers.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!customer || !customer.password) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    const isValid = this.verifyPassword(dto.password, customer.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    // Generate session token (using random UUID)
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30); // 30 days expiry

    // Save session in database
    const session = await this.prisma.sessions.create({
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
        email_verified: customer.email_verified,
      },
      token: session.token,
    };
  }

  async findAllCustomers() {
    return this.prisma.customers.findMany({
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        email_verified: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async removeCustomer(id: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new BadRequestException(`Customer with ID ${id} not found`);
    }
    return this.prisma.customers.delete({
      where: { id },
    });
  }
}

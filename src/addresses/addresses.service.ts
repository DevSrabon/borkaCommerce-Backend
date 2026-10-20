import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async create(customerId: string, dto: CreateAddressDto) {
    if (!dto.country || !dto.country.trim()) {
      throw new BadRequestException('Country is required');
    }
    if (!dto.phone || !dto.phone.trim()) {
      throw new BadRequestException('Phone number is required');
    }
    if (!dto.city || !dto.city.trim()) {
      throw new BadRequestException('City is required');
    }
    if (!dto.full_address || !dto.full_address.trim()) {
      throw new BadRequestException('Full delivery address is required');
    }

    return this.prisma.$transaction(async (tx) => {
      // If setting as default, disable previous defaults
      if (dto.is_default) {
        await tx.customer_addresses.updateMany({
          where: { customer_id: customerId },
          data: { is_default: false },
        });
      }

      // Automatically set the first address as default
      const count = await tx.customer_addresses.count({
        where: { customer_id: customerId },
      });
      const isDefault = count === 0 ? true : (dto.is_default || false);

      // Update customer contact phone if supplied
      if (dto.phone && dto.phone.trim()) {
        await tx.customers.update({
          where: { id: customerId },
          data: { phone: dto.phone.trim() },
        });
      }

      return tx.customer_addresses.create({
        data: {
          customer_id: customerId,
          country: dto.country.trim(),
          phone: dto.phone.trim(),
          city: dto.city.trim(),
          postal_code: dto.postal_code?.trim() || null,
          full_address: dto.full_address.trim(),
          is_default: isDefault,
        },
      });
    });
  }

  async update(customerId: string, addressId: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.customer_addresses.findFirst({
      where: { id: addressId, customer_id: customerId },
    });
    if (!existing) {
      throw new NotFoundException('Delivery address not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // If updating to default, unset other defaults
      if (dto.is_default) {
        await tx.customer_addresses.updateMany({
          where: { customer_id: customerId },
          data: { is_default: false },
        });
      }

      // Update customer contact phone if supplied
      if (dto.phone && dto.phone.trim()) {
        await tx.customers.update({
          where: { id: customerId },
          data: { phone: dto.phone.trim() },
        });
      }

      const resolvedAddress = dto.full_address !== undefined
        ? dto.full_address.trim()
        : existing.full_address;

      return tx.customer_addresses.update({
        where: { id: addressId },
        data: {
          country: dto.country !== undefined ? dto.country.trim() : existing.country,
          phone: dto.phone !== undefined ? dto.phone.trim() : existing.phone,
          city: dto.city !== undefined ? dto.city.trim() : existing.city,
          postal_code: dto.postal_code !== undefined ? dto.postal_code?.trim() || null : existing.postal_code,
          full_address: resolvedAddress,
          is_default: dto.is_default !== undefined ? dto.is_default : existing.is_default,
        },
      });
    });
  }

  async findByCustomer(customerId: string) {
    return this.prisma.customer_addresses.findMany({
      where: { customer_id: customerId },
      orderBy: { is_default: 'desc' },
    });
  }

  async findOne(customerId: string, addressId: string, isAdmin = false) {
    const where: any = { id: addressId };
    if (!isAdmin) {
      where.customer_id = customerId;
    }
    const address = await this.prisma.customer_addresses.findFirst({
      where,
    });
    if (!address) {
      throw new NotFoundException('Delivery address not found');
    }
    return address;
  }

  async delete(customerId: string, addressId: string) {
    return this.prisma.customer_addresses.deleteMany({
      where: { id: addressId, customer_id: customerId },
    });
  }

  async setDefault(customerId: string, addressId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.customer_addresses.updateMany({
        where: { customer_id: customerId },
        data: { is_default: false },
      });
      return tx.customer_addresses.updateMany({
        where: { id: addressId, customer_id: customerId },
        data: { is_default: true },
      });
    });
  }
}

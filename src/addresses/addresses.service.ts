import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async create(customerId: string, dto: CreateAddressDto) {
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

      return tx.customer_addresses.create({
        data: {
          customer_id: customerId,
          country: dto.country,
          city: dto.city,
          area: dto.area,
          street: dto.street,
          building: dto.building,
          postal_code: dto.postal_code,
          is_default: isDefault,
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
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWarehouseDto, AdjustInventoryDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouses.create({
      data: dto,
    });
  }

  async findAllWarehouses() {
    return this.prisma.warehouses.findMany();
  }

  async adjustStock(dto: AdjustInventoryDto) {
    // Verify variant exists
    const variant = await this.prisma.product_variants.findUnique({
      where: { id: dto.variant_id },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Verify warehouse exists
    const warehouse = await this.prisma.warehouses.findUnique({
      where: { id: dto.warehouse_id },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find or create inventory mapping
      let inv = await tx.inventory.findUnique({
        where: {
          variant_id_warehouse_id: {
            variant_id: dto.variant_id,
            warehouse_id: dto.warehouse_id,
          },
        },
      });

      if (!inv) {
        if (dto.quantity < 0) {
          throw new BadRequestException('Cannot deduct inventory. No stock record exists.');
        }

        inv = await tx.inventory.create({
          data: {
            variant_id: dto.variant_id,
            warehouse_id: dto.warehouse_id,
            quantity: 0,
            reserved_quantity: 0,
            available_quantity: 0,
          },
        });
      }

      const newQuantity = inv.quantity + dto.quantity;
      const newAvailable = inv.available_quantity + dto.quantity;

      if (newQuantity < 0 || newAvailable < 0) {
        throw new BadRequestException(
          `Insufficient stock. Current: ${inv.quantity}, Reserved: ${inv.reserved_quantity}. Cannot adjust by ${dto.quantity}.`
        );
      }

      // Update stock levels
      const updatedInv = await tx.inventory.update({
        where: { id: inv.id },
        data: {
          quantity: newQuantity,
          available_quantity: newAvailable,
        },
      });

      // Write inventory audit log
      await tx.inventory_transactions.create({
        data: {
          variant_id: dto.variant_id,
          warehouse_id: dto.warehouse_id,
          type: dto.type,
          quantity: dto.quantity,
          reference_type: dto.reference_type || 'MANUAL_ADJUSTMENT',
          reference_id: dto.reference_id,
        },
      });

      return updatedInv;
    });
  }

  async getInventoryStatus() {
    return this.prisma.inventory.findMany({
      include: {
        variant: {
          include: {
            product: true,
          },
        },
        warehouse: true,
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  async getTransactions(variantId?: string) {
    const where: any = {};
    if (variantId) {
      where.variant_id = variantId;
    }
    return this.prisma.inventory_transactions.findMany({
      where,
      include: {
        warehouse: true,
        variant: {
          include: { product: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}

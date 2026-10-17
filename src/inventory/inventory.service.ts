import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWarehouseDto, AdjustInventoryDto, BatchAdjustInventoryDto } from './dto/inventory.dto';
import { inventory_transaction_type } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getDefaultWarehouse() {
    let warehouse = await this.prisma.warehouses.findFirst();
    if (!warehouse) {
      warehouse = await this.prisma.warehouses.create({
        data: {
          name: 'Main Store / Warehouse',
          location: 'Dubai, UAE',
        },
      });
    }
    return warehouse;
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouses.create({
      data: dto,
    });
  }

  async findAllWarehouses(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.warehouses.findMany({
        take,
        skip: skipCount,
      }),
      this.prisma.warehouses.count(),
    ]);

    return { items, total };
  }

  async adjustStock(dto: AdjustInventoryDto) {
    // Verify variant exists
    const variant = await this.prisma.product_variants.findUnique({
      where: { id: dto.variant_id },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Resolve warehouse (default if not provided)
    let warehouseId = dto.warehouse_id;
    if (!warehouseId) {
      const defaultWh = await this.getDefaultWarehouse();
      warehouseId = defaultWh.id;
    } else {
      const warehouse = await this.prisma.warehouses.findUnique({
        where: { id: warehouseId },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }
    }

    const txType =
      dto.type ||
      (dto.quantity >= 0
        ? inventory_transaction_type.PURCHASE
        : inventory_transaction_type.MANUAL_ADJUSTMENT);

    const auditRef = dto.note?.trim() || dto.reference_type || (dto.quantity >= 0 ? 'STOCK_IN' : 'STOCK_OUT');

    return this.prisma.$transaction(async (tx) => {
      // Find or create inventory mapping
      let inv = await tx.inventory.findUnique({
        where: {
          variant_id_warehouse_id: {
            variant_id: dto.variant_id,
            warehouse_id: warehouseId,
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
            warehouse_id: warehouseId,
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
          `Insufficient stock for SKU ${variant.sku}. Current: ${inv.quantity}, Reserved: ${inv.reserved_quantity}. Cannot adjust by ${dto.quantity}.`
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
          warehouse_id: warehouseId,
          type: txType,
          quantity: dto.quantity,
          reference_type: auditRef,
          reference_id: dto.reference_id,
        },
      });

      return updatedInv;
    });
  }

  async batchAdjust(dto: BatchAdjustInventoryDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('No items provided for stock adjustment');
    }

    // Resolve warehouse (default if not provided)
    let warehouseId = dto.warehouse_id;
    if (!warehouseId) {
      const defaultWh = await this.getDefaultWarehouse();
      warehouseId = defaultWh.id;
    }

    const auditRef = dto.note?.trim() || dto.reference_type || 'BATCH_ADJUSTMENT';

    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];

      for (const item of dto.items) {
        if (!item.variant_id || item.quantity === 0) continue;

        const variant = await tx.product_variants.findUnique({
          where: { id: item.variant_id },
          include: { product: true },
        });

        if (!variant) {
          throw new NotFoundException(`Variant ${item.variant_id} not found`);
        }

        const txType =
          dto.type ||
          (item.quantity >= 0
            ? inventory_transaction_type.PURCHASE
            : inventory_transaction_type.MANUAL_ADJUSTMENT);

        let inv = await tx.inventory.findUnique({
          where: {
            variant_id_warehouse_id: {
              variant_id: item.variant_id,
              warehouse_id: warehouseId,
            },
          },
        });

        if (!inv) {
          if (item.quantity < 0) {
            throw new BadRequestException(`Cannot deduct inventory for SKU "${variant.sku}". No stock record exists.`);
          }

          inv = await tx.inventory.create({
            data: {
              variant_id: item.variant_id,
              warehouse_id: warehouseId,
              quantity: 0,
              reserved_quantity: 0,
              available_quantity: 0,
            },
          });
        }

        const newQuantity = inv.quantity + item.quantity;
        const newAvailable = inv.available_quantity + item.quantity;

        if (newQuantity < 0 || newAvailable < 0) {
          throw new BadRequestException(
            `Insufficient stock for SKU "${variant.sku}". Current available: ${inv.available_quantity}. Cannot deduct ${Math.abs(item.quantity)}.`
          );
        }

        const updatedInv = await tx.inventory.update({
          where: { id: inv.id },
          data: {
            quantity: newQuantity,
            available_quantity: newAvailable,
          },
        });

        await tx.inventory_transactions.create({
          data: {
            variant_id: item.variant_id,
            warehouse_id: warehouseId,
            type: txType,
            quantity: item.quantity,
            reference_type: auditRef,
          },
        });

        results.push(updatedInv);
      }

      return {
        success: true,
        adjusted_count: results.length,
        items: results,
      };
    });
  }

  async deleteInventory(id: string) {
    const existing = await this.prisma.inventory.findUnique({
      where: { id },
      include: { variant: true },
    });
    if (!existing) {
      throw new NotFoundException('Inventory record not found');
    }

    await this.prisma.inventory.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Inventory record for SKU "${existing.variant?.sku || id}" deleted successfully`,
    };
  }

  async getInventoryStatus() {
    const records = await this.prisma.inventory.findMany({
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
            attributes: {
              include: {
                attribute_value: {
                  include: {
                    attribute: true,
                  },
                },
              },
            },
          },
        },
        warehouse: true,
      },
      orderBy: { updated_at: 'desc' },
    });

    return records.map((r) => {
      const thumb =
        r.variant?.product?.images?.find((img) => img.is_thumbnail)?.image_url ||
        r.variant?.product?.images?.[0]?.image_url ||
        null;

      return {
        ...r,
        variant: {
          ...r.variant,
          product: r.variant?.product
            ? {
                ...r.variant.product,
                thumbnail_url: thumb,
              }
            : null,
        },
      };
    });
  }

  async getTransactions(variantId?: string, limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;
    const where: any = {};
    if (variantId) {
      where.variant_id = variantId;
    }
    const [items, total] = await Promise.all([
      this.prisma.inventory_transactions.findMany({
        where,
        take,
        skip: skipCount,
        include: {
          warehouse: true,
          variant: {
            include: { product: true },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.inventory_transactions.count({ where }),
    ]);

    return { items, total };
  }
}

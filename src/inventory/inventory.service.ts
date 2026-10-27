import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AdjustInventoryDto, BatchAdjustInventoryDto } from './dto/inventory.dto';
import { inventory_transaction_type } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async adjustStock(dto: AdjustInventoryDto) {
    // Verify variant exists
    const variant = await this.prisma.product_variants.findUnique({
      where: { id: dto.variant_id },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
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
        where: { variant_id: dto.variant_id },
      });

      if (!inv) {
        if (dto.quantity < 0) {
          throw new BadRequestException('Cannot deduct inventory. No stock record exists.');
        }

        inv = await tx.inventory.create({
          data: {
            variant_id: dto.variant_id,
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
          where: { variant_id: item.variant_id },
        });

        if (!inv) {
          if (item.quantity < 0) {
            throw new BadRequestException(`Cannot deduct inventory for SKU "${variant.sku}". No stock record exists.`);
          }

          inv = await tx.inventory.create({
            data: {
              variant_id: item.variant_id,
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

  async getInventoryStatus(params?: {
    page?: number;
    limit?: number;
    skip?: number;
    search?: string;
    status?: string;
  }) {
    const page = params?.page && params.page > 0 ? Number(params.page) : 1;
    const limit = params?.limit !== undefined ? Number(params.limit) : 25;
    const isAll = limit <= 0;
    const take = isAll ? undefined : (limit > 0 ? limit : 25);
    const skip = params?.skip !== undefined ? Number(params.skip) : (isAll ? undefined : (page - 1) * (take || 25));

    const where: any = {};

    const status = params?.status?.toUpperCase();
    if (status === 'IN_STOCK') {
      where.available_quantity = { gt: 5 };
    } else if (status === 'LOW_STOCK') {
      where.available_quantity = { gt: 0, lte: 5 };
    } else if (status === 'OUT_OF_STOCK') {
      where.available_quantity = { lte: 0 };
    }

    if (params?.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { variant: { sku: { contains: q, mode: 'insensitive' } } },
        { variant: { product: { name: { contains: q, mode: 'insensitive' } } } },
        { variant: { attributes: { some: { attribute_value: { value: { contains: q, mode: 'insensitive' } } } } } },
      ];
    }

    const [records, total, countsRaw] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        take,
        skip,
        include: {
          variant: {
            include: {
              product: {
                include: {
                  images: {
                    select: {
                      id: true,
                      image_url: true,
                      is_thumbnail: true,
                    },
                  },
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
        },
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.inventory.count({ where }),
      this.prisma
        .$queryRawUnsafe<any[]>(
          `SELECT 
            COUNT(*)::int as all_count, 
            COUNT(CASE WHEN available_quantity > 5 THEN 1 END)::int as in_stock, 
            COUNT(CASE WHEN available_quantity > 0 AND available_quantity <= 5 THEN 1 END)::int as low_stock, 
            COUNT(CASE WHEN available_quantity <= 0 THEN 1 END)::int as out_of_stock 
          FROM inventory`,
        )
        .catch(() => [{ all_count: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 }]),
    ]);

    const items = records.map((r) => {
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

    const counts = {
      all: countsRaw[0]?.all_count ?? total,
      in_stock: countsRaw[0]?.in_stock ?? 0,
      low_stock: countsRaw[0]?.low_stock ?? 0,
      out_of_stock: countsRaw[0]?.out_of_stock ?? 0,
    };

    return {
      items,
      total,
      page,
      limit: take || total,
      totalPages: take ? Math.max(1, Math.ceil(total / take)) : 1,
      counts,
    };
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

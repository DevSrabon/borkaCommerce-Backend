import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto, BatchAdjustInventoryDto } from './dto/inventory.dto';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(AdminGuard)
@Controller('admin')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('inventory/adjust')
  adjustStock(@Body() adjustInventoryDto: AdjustInventoryDto) {
    return this.inventoryService.adjustStock(adjustInventoryDto);
  }

  @Post('inventory/batch-adjust')
  batchAdjust(@Body() batchAdjustDto: BatchAdjustInventoryDto) {
    return this.inventoryService.batchAdjust(batchAdjustDto);
  }

  @Delete('inventory/:id')
  deleteInventory(@Param('id') id: string) {
    return this.inventoryService.deleteInventory(id);
  }

  @Get('inventory')
  async getInventoryStatus(
    @Query('page') page?: string,
    @Query('skip') skip?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = 25;
    const skipNum = skip ? parseInt(skip, 10) : undefined;
    const result = await this.inventoryService.getInventoryStatus({
      page: pageNum,
      limit: limitNum,
      skip: skipNum,
      search,
      status,
    });
    if (res) {
      res.setHeader('x-total-count', result.total.toString());
    }
    return result;
  }

  @Get('inventory/transactions')
  async getTransactions(
    @Query('page') page?: string,
    @Query('variant_id') variantId?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = 50;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : (skip ? Math.floor(Math.max(0, parseInt(skip, 10)) / limitNum) + 1 : 1);
    const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : (pageNum - 1) * limitNum;
    const { items, total } = await this.inventoryService.getTransactions(variantId, limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      skip: skipNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    };
  }
}

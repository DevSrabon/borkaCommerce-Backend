import { Controller, Get, Post, Body, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto, AdjustInventoryDto } from './dto/inventory.dto';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(AdminGuard)
@Controller('admin')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('warehouses')
  createWarehouse(@Body() createWarehouseDto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(createWarehouseDto);
  }

  @Get('warehouses')
  async findAllWarehouses(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.inventoryService.findAllWarehouses(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @Post('inventory/adjust')
  adjustStock(@Body() adjustInventoryDto: AdjustInventoryDto) {
    return this.inventoryService.adjustStock(adjustInventoryDto);
  }

  @Get('inventory')
  getInventoryStatus() {
    return this.inventoryService.getInventoryStatus();
  }

  @Get('inventory/transactions')
  async getTransactions(
    @Query('variant_id') variantId?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.inventoryService.getTransactions(variantId, limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }
}

import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
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
  findAllWarehouses() {
    return this.inventoryService.findAllWarehouses();
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
  getTransactions(@Query('variant_id') variantId?: string) {
    return this.inventoryService.getTransactions(variantId);
  }
}

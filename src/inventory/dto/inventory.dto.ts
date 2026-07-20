import { IsString, IsNotEmpty, IsOptional, IsInt, IsUUID, IsEnum } from 'class-validator';
import { inventory_transaction_type } from '@prisma/client';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  location: string;
}

export class AdjustInventoryDto {
  @IsUUID()
  @IsNotEmpty()
  variant_id: string;

  @IsUUID()
  @IsNotEmpty()
  warehouse_id: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number; // Positive to add, negative to deduct

  @IsEnum(inventory_transaction_type)
  @IsNotEmpty()
  type: inventory_transaction_type;

  @IsString()
  @IsOptional()
  reference_type?: string; // e.g. "MANUAL", "DAMAGE", "PURCHASE"

  @IsString()
  @IsOptional()
  reference_id?: string;
}

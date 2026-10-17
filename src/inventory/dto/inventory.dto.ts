import { IsString, IsNotEmpty, IsOptional, IsInt, IsUUID, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsOptional()
  warehouse_id?: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number; // Positive to add (Stock In), negative to deduct (Stock Out)

  @IsEnum(inventory_transaction_type)
  @IsOptional()
  type?: inventory_transaction_type;

  @IsString()
  @IsOptional()
  reference_type?: string;

  @IsString()
  @IsOptional()
  reference_id?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class BatchAdjustItemDto {
  @IsUUID()
  @IsNotEmpty()
  variant_id: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number; // Positive to add (Stock In), negative to deduct (Stock Out)
}

export class BatchAdjustInventoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAdjustItemDto)
  items: BatchAdjustItemDto[];

  @IsUUID()
  @IsOptional()
  warehouse_id?: string;

  @IsEnum(inventory_transaction_type)
  @IsOptional()
  type?: inventory_transaction_type;

  @IsString()
  @IsOptional()
  reference_type?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

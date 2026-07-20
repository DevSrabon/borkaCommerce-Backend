import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsUUID, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { order_status } from '@prisma/client';

export class CheckoutItemDto {
  @IsString()
  @IsNotEmpty()
  variant_id: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number;
}

export class CheckoutDto {
  @IsUUID()
  @IsNotEmpty()
  address_id: string;

  @IsString()
  @IsOptional()
  coupon_code?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(order_status)
  @IsNotEmpty()
  status: order_status;
}

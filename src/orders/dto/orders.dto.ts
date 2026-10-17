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

  @IsString()
  @IsOptional()
  payment_method?: 'STRIPE' | 'CASH_ON_DELIVERY';

  @IsString()
  @IsOptional()
  origin?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(order_status)
  @IsOptional()
  status?: order_status;

  @IsOptional()
  notify_customer?: boolean;

  @IsString()
  @IsOptional()
  delivery_partner?: string;

  @IsString()
  @IsOptional()
  tracking_number?: string;

  @IsString()
  @IsOptional()
  tracking_url?: string;

  @IsString()
  @IsOptional()
  delivery_notes?: string;
}

export class ManualOrderItemDto {
  @IsString()
  @IsNotEmpty()
  variant_id: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number;

  @IsOptional()
  price?: number;
}

export class CreateManualOrderDto {
  @IsOptional()
  @IsString()
  customer_id?: string;

  @IsOptional()
  @IsString()
  customer_first_name?: string;

  @IsOptional()
  @IsString()
  customer_last_name?: string;

  @IsOptional()
  @IsString()
  customer_email?: string;

  @IsOptional()
  @IsString()
  customer_phone?: string;

  @IsOptional()
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items: ManualOrderItemDto[];

  @IsOptional()
  delivery_charge?: number;

  @IsOptional()
  discount?: number;

  @IsOptional()
  currency?: string;

  @IsOptional()
  payment_method?: string;

  @IsOptional()
  payment_status?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsString()
  delivery_partner?: string;

  @IsOptional()
  @IsString()
  tracking_number?: string;

  @IsOptional()
  @IsString()
  tracking_url?: string;

  @IsOptional()
  @IsString()
  delivery_notes?: string;
}

export class UpdateOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items: ManualOrderItemDto[];

  @IsOptional()
  shipping?: number;

  @IsOptional()
  discount?: number;
}

export class UpdateOrderAddressDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  postal_code?: string;
}

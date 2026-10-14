import { IsString, IsNotEmpty, IsEnum, IsNumber, IsDate, IsBoolean, IsOptional, IsArray, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { discount_type, offer_type, offer_status } from '@prisma/client';

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(offer_type)
  @IsOptional()
  type?: offer_type;

  @IsNumber()
  @IsNotEmpty()
  priority: number;

  @IsEnum(discount_type)
  @IsNotEmpty()
  discount_type: discount_type;

  @IsNumber()
  @IsNotEmpty()
  discount_value: number;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  start_date: Date;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  end_date: Date;

  @IsEnum(offer_status)
  @IsOptional()
  status?: offer_status;

  @IsString()
  @IsOptional()
  apply_to?: 'ALL' | 'CATEGORIES' | 'PRODUCTS';

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  variant_ids?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  product_ids?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  category_ids?: string[];
}

export class UpdateOfferDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(offer_type)
  @IsOptional()
  type?: offer_type;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsEnum(discount_type)
  @IsOptional()
  discount_type?: discount_type;

  @IsNumber()
  @IsOptional()
  discount_value?: number;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  start_date?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  end_date?: Date;

  @IsEnum(offer_status)
  @IsOptional()
  status?: offer_status;

  @IsString()
  @IsOptional()
  apply_to?: 'ALL' | 'CATEGORIES' | 'PRODUCTS';

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  variant_ids?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  product_ids?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  category_ids?: string[];
}

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsEnum(discount_type)
  @IsNotEmpty()
  discount_type: discount_type;

  @IsNumber()
  @IsNotEmpty()
  discount_value: number;

  @IsNumber()
  @IsOptional()
  minimum_amount?: number;

  @IsNumber()
  @IsOptional()
  maximum_discount?: number;

  @IsNumber()
  @IsOptional()
  usage_limit?: number;

  @IsNumber()
  @IsOptional()
  usage_per_customer?: number;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  start_date: Date;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  end_date: Date;

  @IsBoolean()
  @IsOptional()
  status?: boolean;
}

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @IsNotEmpty()
  order_subtotal: number;
}

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsEnum(discount_type)
  @IsOptional()
  discount_type?: discount_type;

  @IsNumber()
  @IsOptional()
  discount_value?: number;

  @IsNumber()
  @IsOptional()
  minimum_amount?: number;

  @IsNumber()
  @IsOptional()
  maximum_discount?: number;

  @IsNumber()
  @IsOptional()
  usage_limit?: number;

  @IsNumber()
  @IsOptional()
  usage_per_customer?: number;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  start_date?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  end_date?: Date;

  @IsBoolean()
  @IsOptional()
  status?: boolean;
}

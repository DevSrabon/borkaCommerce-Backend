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

export class SendPromotionalEmailDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsOptional()
  headline?: string;

  @IsString()
  @IsOptional()
  preheader?: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  banner_url?: string;

  @IsString()
  @IsOptional()
  coupon_code?: string;

  @IsString()
  @IsOptional()
  cta_text?: string;

  @IsString()
  @IsOptional()
  cta_url?: string;

  @IsString()
  @IsOptional()
  audience?: 'ALL' | 'BUYERS' | 'CUSTOM';

  @IsArray()
  @IsOptional()
  custom_emails?: string[];

  @IsArray()
  @IsOptional()
  product_ids?: string[];

  @IsBoolean()
  @IsOptional()
  test_email_only?: boolean;

  @IsString()
  @IsOptional()
  test_recipient?: string;
}

export class UpdatePromoPopupDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  coupon_code?: string;

  @IsString()
  @IsOptional()
  image_url?: string;

  @IsString()
  @IsOptional()
  btn_text?: string;

  @IsString()
  @IsOptional()
  btn_url?: string;

  @IsNumber()
  @IsOptional()
  delay_seconds?: number;

  @IsString()
  @IsOptional()
  frequency?: 'once_per_session' | 'every_page';
}

import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsArray, IsNumber, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { product_status, variant_status } from '@prisma/client';

export class ProductImageDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  image_url: string;

  @IsString()
  @IsOptional()
  alt_text?: string;

  @IsBoolean()
  @IsOptional()
  is_thumbnail?: boolean;

  @IsNumber()
  @IsOptional()
  sort_order?: number;
}

export class VariantAttributeDto {
  @IsString()
  @IsNotEmpty()
  name: string; // e.g., "Color", "Size"

  @IsString()
  @IsNotEmpty()
  value: string; // e.g., "Black", "54"
}

export class CreateVariantDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  @IsNumber()
  @IsOptional()
  compare_price?: number;

  @IsNumber()
  @IsOptional()
  cost_price?: number;

  @IsEnum(variant_status)
  @IsOptional()
  status?: variant_status;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  @IsOptional()
  attributes?: VariantAttributeDto[];

  @IsArray()
  @IsOptional()
  images?: (string | ProductImageDto)[];

  @IsNumber()
  @IsNotEmpty()
  initial_quantity: number;

  @IsUUID()
  @IsOptional()
  warehouse_id?: string; // If not provided, maps to the first/default warehouse
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  short_description?: string;

  @IsString()
  @IsOptional()
  sku_prefix?: string;

  @IsString()
  @IsOptional()
  seo_title?: string;

  @IsString()
  @IsOptional()
  seo_description?: string;

  @IsString()
  @IsOptional()
  seo_keywords?: string;

  @IsEnum(product_status)
  @IsOptional()
  status?: product_status;

  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @IsBoolean()
  @IsOptional()
  is_cod_allowed?: boolean;

  @IsArray()
  @IsUUID(undefined, { each: true })
  category_ids: string[];

  @IsString()
  @IsOptional()
  tags?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  related_category_ids?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  @IsOptional()
  images?: ProductImageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  short_description?: string;

  @IsString()
  @IsOptional()
  sku_prefix?: string;

  @IsString()
  @IsOptional()
  seo_title?: string;

  @IsString()
  @IsOptional()
  seo_description?: string;

  @IsString()
  @IsOptional()
  seo_keywords?: string;

  @IsEnum(product_status)
  @IsOptional()
  status?: product_status;

  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @IsBoolean()
  @IsOptional()
  is_cod_allowed?: boolean;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  category_ids?: string[];

  @IsString()
  @IsOptional()
  tags?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  related_category_ids?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  @IsOptional()
  images?: ProductImageDto[];

  @IsArray()
  @IsOptional()
  variants?: any[];

  @IsBoolean()
  @IsOptional()
  notify_customers?: boolean;
}


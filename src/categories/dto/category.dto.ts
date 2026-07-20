import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsInt()
  @IsOptional()
  sort_order?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsUUID()
  @IsOptional()
  parent_id?: string;
}

export class UpdateCategoryDto {
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
  image?: string;

  @IsInt()
  @IsOptional()
  sort_order?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsUUID()
  @IsOptional()
  parent_id?: string;
}

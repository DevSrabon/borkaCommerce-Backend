import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsString()
  @IsOptional()
  full_address?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

export class UpdateAddressDto {
  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsString()
  @IsOptional()
  full_address?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

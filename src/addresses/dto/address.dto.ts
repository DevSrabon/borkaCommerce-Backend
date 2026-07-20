import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  area: string;

  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  building: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

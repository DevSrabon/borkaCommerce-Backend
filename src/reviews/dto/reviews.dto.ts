import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, IsEnum } from 'class-validator';
import { review_status } from '@prisma/client';

export class CreateReviewDto {
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  review?: string;
}

export class UpdateReviewStatusDto {
  @IsEnum(review_status)
  status: review_status;
}

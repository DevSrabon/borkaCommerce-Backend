import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsEmail, IsIn } from 'class-validator';

export class CreateBlogDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  featured_image?: string;

  @IsOptional()
  @IsString()
  main_image?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @IsOptional()
  @IsString()
  published_at?: string;
}

export class UpdateBlogDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  featured_image?: string;

  @IsOptional()
  @IsString()
  main_image?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @IsOptional()
  @IsString()
  published_at?: string;
}

export class CreateBlogCommentDto {
  @IsNotEmpty()
  @IsString()
  author_name: string;

  @IsNotEmpty()
  @IsEmail()
  author_email: string;

  @IsNotEmpty()
  @IsString()
  content: string;
}

export class UpdateCommentStatusDto {
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED', 'PENDING'])
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
}

export class CreateBlogCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}

export class UpdateBlogCategoryDto {
  @IsNotEmpty()
  @IsString()
  oldName: string;

  @IsNotEmpty()
  @IsString()
  newName: string;
}

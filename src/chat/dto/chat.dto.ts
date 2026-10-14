import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class InitChatSessionDto {
  @IsNotEmpty()
  @IsString()
  session_id: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  customer_email?: string;
}

export class SendChatMessageDto {
  @IsNotEmpty()
  @IsString()
  session_id: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  sender_name?: string;

  @IsOptional()
  @IsString()
  attachment_url?: string;

  @IsOptional()
  @IsString()
  attachment_type?: string; // 'image' | 'file'

  @IsOptional()
  @IsString()
  attachment_name?: string;
}

export class AdminReplyChatDto {
  @IsNotEmpty()
  @IsString()
  session_id: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  attachment_url?: string;

  @IsOptional()
  @IsString()
  attachment_type?: string;

  @IsOptional()
  @IsString()
  attachment_name?: string;

  @IsOptional()
  @IsBoolean()
  send_email?: boolean;
}

export class SetTypingDto {
  @IsNotEmpty()
  @IsString()
  session_id: string;

  @IsNotEmpty()
  @IsBoolean()
  is_typing: boolean;
}

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Ip,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { ChatService } from './chat.service';
import {
  InitChatSessionDto,
  SendChatMessageDto,
  AdminReplyChatDto,
  SetTypingDto,
} from './dto/chat.dto';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ==========================================
  // STOREFRONT / CUSTOMER ENDPOINTS
  // ==========================================

  @Post('ecommerce/chat/session')
  async initSession(@Body() dto: InitChatSessionDto, @Ip() ip: string) {
    return this.chatService.getOrCreateSession(
      dto.session_id,
      undefined,
      dto.customer_name,
      dto.customer_email,
      ip,
    );
  }

  @Get('ecommerce/chat/messages/:sessionId')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('role') role?: string,
  ) {
    const isCustomer = role === 'customer';
    return this.chatService.getMessages(sessionId, isCustomer);
  }

  @Post('ecommerce/chat/heartbeat')
  async heartbeat(@Body('session_id') sessionId: string) {
    if (sessionId) {
      this.chatService.recordCustomerActivity(sessionId);
    }
    return { status: 'ok', session_id: sessionId };
  }

  @Post('ecommerce/chat/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const dest = join(process.cwd(), 'uploads', 'chat');
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          callback(null, dest);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  )
  async uploadChatAttachment(@UploadedFile() file: any, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No attachment file provided');
    }
    const relativePath = `/chat/${file.filename}`;
    const isImage =
      file.mimetype?.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname);

    const host = req?.get ? (req.get('x-forwarded-host') || req.get('host')) : undefined;
    const baseUrl =
      process.env.UPLOAD_PUBLIC_BASE_URL ||
      process.env.BACKEND_URL ||
      (host && !host.includes('localhost') ? `${proto}://${host}` : undefined);

    const attachmentUrl = baseUrl
      ? `${baseUrl.replace(/\/+$/, '')}/uploads${relativePath}`
      : `/uploads${relativePath}`;

    return {
      attachment_url: attachmentUrl,
      attachment_type: isImage ? 'image' : 'file',
      attachment_name: file.originalname,
      size: file.size,
    };
  }

  @Post('ecommerce/chat/message')
  async sendCustomerMessage(
    @Body() dto: SendChatMessageDto,
    @Ip() ip: string,
  ) {
    return this.chatService.sendCustomerMessage(
      dto.session_id,
      dto.message,
      dto.sender_name,
      ip,
      dto.attachment_url,
      dto.attachment_type,
      dto.attachment_name,
    );
  }

  @Post('ecommerce/chat/typing')
  async setCustomerTyping(@Body() dto: SetTypingDto) {
    return this.chatService.setTyping(dto.session_id, 'CUSTOMER', dto.is_typing);
  }

  @Post('ecommerce/chat/mark-read/:sessionId')
  async markCustomerRead(@Param('sessionId') sessionId: string) {
    return this.chatService.markAsRead(sessionId, 'CUSTOMER');
  }

  // ==========================================
  // ADMIN SUPPORT ENDPOINTS
  // ==========================================

  @Get('admin/chat/sessions')
  @UseGuards(AdminGuard)
  async getAdminSessions() {
    return this.chatService.getAdminSessions();
  }

  @Get('admin/chat/unread-count')
  @UseGuards(AdminGuard)
  async getAdminUnreadTotal() {
    return this.chatService.getAdminUnreadTotal();
  }

  @Post('admin/chat/reply')
  @UseGuards(AdminGuard)
  async adminReply(@Body() dto: AdminReplyChatDto, @Req() req: any) {
    const adminName =
      req.user?.first_name ? `${req.user.first_name} (Admin)` : 'Support Consultant';
    return this.chatService.sendAdminReply(
      dto.session_id,
      dto.message,
      adminName,
      dto.attachment_url,
      dto.attachment_type,
      dto.attachment_name,
      dto.send_email || false,
    );
  }

  @Post('admin/chat/typing')
  @UseGuards(AdminGuard)
  async setAdminTyping(@Body() dto: SetTypingDto) {
    return this.chatService.setTyping(dto.session_id, 'ADMIN', dto.is_typing);
  }

  @Post('admin/chat/mark-read/:sessionId')
  @UseGuards(AdminGuard)
  async markAdminRead(@Param('sessionId') sessionId: string) {
    return this.chatService.markAsRead(sessionId, 'ADMIN');
  }

  @Delete('admin/chat/sessions/:sessionId')
  @UseGuards(AdminGuard)
  async deleteSession(@Param('sessionId') sessionId: string) {
    return this.chatService.deleteSession(sessionId);
  }

  @Delete('admin/chat/sessions')
  @UseGuards(AdminGuard)
  async deleteAllSessions() {
    return this.chatService.deleteAllSessions();
  }
}

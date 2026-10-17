import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface CreateNotificationDto {
  type: 'ORDER' | 'REVIEW' | 'BLOG_COMMENT';
  title: string;
  message: string;
  link?: string;
  metadata?: any;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async createNotification(dto: CreateNotificationDto) {
    try {
      const created = await (this.prisma as any).notifications.create({
        data: {
          type: dto.type,
          title: dto.title,
          message: dto.message,
          link: dto.link || null,
          metadata: dto.metadata || null,
          is_read: false,
        },
      });
      if (created) {
        this.realtimeGateway.emitNotification(created);
        const unreadCount = await (this.prisma as any).notifications.count({
          where: { is_read: false },
        });
        this.realtimeGateway.emitUnreadCount(unreadCount);
      }
      return created;
    } catch (err: any) {
      this.logger.error(`Failed to create notification: ${err.message}`);
      return null;
    }
  }

  async findAll(query?: { unreadOnly?: boolean; limit?: number }) {
    const where: any = {};
    if (query?.unreadOnly) {
      where.is_read = false;
    }

    const [items, unreadCount, total] = await Promise.all([
      (this.prisma as any).notifications.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: query?.limit ? Number(query.limit) : 50,
      }),
      (this.prisma as any).notifications.count({
        where: { is_read: false },
      }),
      (this.prisma as any).notifications.count(),
    ]);

    return {
      items,
      unread_count: unreadCount,
      total,
    };
  }

  async markAsRead(id: string) {
    return (this.prisma as any).notifications.update({
      where: { id },
      data: { is_read: true },
    });
  }

  async markAllAsRead() {
    return (this.prisma as any).notifications.updateMany({
      where: { is_read: false },
      data: { is_read: true },
    });
  }

  async clearAll() {
    return (this.prisma as any).notifications.deleteMany();
  }

  async delete(id: string) {
    return (this.prisma as any).notifications.delete({
      where: { id },
    });
  }
}

import { Controller, Get, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/notifications')
@UseGuards(AuthGuard, AdminGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @Query('unread_only') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAll({
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : 50,
    });
  }

  @Patch('read-all')
  async markAllAsRead() {
    return this.notificationsService.markAllAsRead();
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Delete('clear-all')
  async clearAll() {
    return this.notificationsService.clearAll();
  }

  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    return this.notificationsService.delete(id);
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`[Socket.IO] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Socket.IO] Client disconnected: ${client.id}`);
  }

  // Admin joins global administrative room
  @SubscribeMessage('join_admin')
  handleJoinAdmin(@ConnectedSocket() client: Socket) {
    client.join('admin');
    this.logger.log(`[Socket.IO] Client ${client.id} joined admin room`);
    return { status: 'joined_admin' };
  }

  // Customer or admin joins a specific chat session room
  @SubscribeMessage('join_session')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { session_id: string },
  ) {
    if (data?.session_id) {
      const room = `session_${data.session_id}`;
      client.join(room);
      this.logger.log(`[Socket.IO] Client ${client.id} joined room ${room}`);
      return { status: 'joined', room };
    }
  }

  @SubscribeMessage('leave_session')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { session_id: string },
  ) {
    if (data?.session_id) {
      const room = `session_${data.session_id}`;
      client.leave(room);
      this.logger.log(`[Socket.IO] Client ${client.id} left room ${room}`);
      return { status: 'left', room };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      session_id: string;
      is_typing: boolean;
      sender_type: 'CUSTOMER' | 'ADMIN';
      name?: string;
    },
  ) {
    if (data?.session_id) {
      const room = `session_${data.session_id}`;
      // Broadcast to everybody else in the session room & to admin room
      client.to(room).emit('chat_typing', data);
      client.to('admin').emit('chat_typing', data);
    }
  }

  // --- Real-Time Server Broadcast Emitters ---

  /**
   * Broadcast new notification to all connected admins
   */
  emitNotification(notification: any) {
    try {
      if (this.server) {
        this.server.to('admin').emit('admin_notification', notification);
        this.logger.log(`[Socket.IO] Emitted notification ${notification.id} to admin room`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to emit notification via Socket.IO: ${err.message}`);
    }
  }

  /**
   * Broadcast new chat message to both customer session room and admin room
   */
  emitChatMessage(sessionId: string, message: any) {
    try {
      if (this.server) {
        const room = `session_${sessionId}`;
        this.server.to(room).emit('chat_message', message);
        this.server.to('admin').emit('chat_message', { ...message, session_id: sessionId });
        this.logger.log(`[Socket.IO] Emitted chat message to ${room} and admin room`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to emit chat message via Socket.IO: ${err.message}`);
    }
  }

  /**
   * Broadcast updated unread count to admins
   */
  emitUnreadCount(count: number) {
    try {
      if (this.server) {
        this.server.to('admin').emit('admin_unread_count', { unread_count: count });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to emit unread count: ${err.message}`);
    }
  }

  emitSessionDeleted(sessionId: string) {
    try {
      if (this.server) {
        this.server.to(`session_${sessionId}`).emit('session_deleted', { session_id: sessionId });
        this.server.to('admin').emit('chat_session_deleted', { session_id: sessionId });
      }
    } catch (_) {}
  }

  emitAllSessionsDeleted() {
    try {
      if (this.server) {
        this.server.to('admin').emit('chat_all_sessions_deleted', {});
      }
    } catch (_) {}
  }
}


import { Injectable, HttpException, HttpStatus, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface RateLimitBucket {
  timestamps: number[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  
  // Rate limiting buckets:
  // Session: max 10 messages per 60 seconds
  // IP: max 25 messages per 60 seconds
  private sessionRateMap = new Map<string, RateLimitBucket>();
  private ipRateMap = new Map<string, RateLimitBucket>();

  private readonly SESSION_LIMIT = 10;
  private readonly IP_LIMIT = 25;
  private readonly WINDOW_MS = 60 * 1000;

  // Real-time Presence: Map of sessionId -> timestamp (ms) of customer activity
  private customerActivityMap = new Map<string, number>();

  // Real-time Admin Presence: timestamp (ms) of the most recent admin action / poll
  private lastAdminActivityTimestamp: number = 0;
  // Cooldown map: sessionId -> timestamp (ms) of last missed chat email sent (to prevent flooding)
  private sessionLastEmailedMap = new Map<string, number>();
  private sessionLastInactiveNoticeMap = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private realtimeGateway: RealtimeGateway,
  ) {
    this.realtimeGateway.onCustomerActivity((sessionId) => {
      this.recordCustomerActivity(sessionId);
    });
  }

  /**
   * Record admin presence (polled unread count, opened sessions, replied, or typed)
   */
  recordAdminActivity() {
    this.lastAdminActivityTimestamp = Date.now();
  }

  /**
   * Check if all store administrators are currently inactive/offline
   * Considers admins inactive if no admin activity was detected in the last 60 seconds
   */
  isAdminInactive(): boolean {
    if (!this.lastAdminActivityTimestamp) return true;
    return Date.now() - this.lastAdminActivityTimestamp > 60000;
  }

  /**
   * Record customer activity (presence heartbeat / message / poll)
   */
  recordCustomerActivity(sessionId: string) {
    if (!sessionId) return;
    this.customerActivityMap.set(sessionId, Date.now());
  }

  /**
   * Get presence information for a session
   * Considers customer online ONLY if active customer activity was recorded in memory within last 45 seconds
   */
  getCustomerPresence(
    sessionId: string,
    fallbackLastCustomerMessageAt?: Date | string | null,
    fallbackCreatedAt?: Date | string | null,
  ) {
    const memoryTimestamp = this.customerActivityMap.get(sessionId);
    const now = Date.now();

    // Customer is ONLY online if memoryTimestamp exists and is less than 45 seconds old
    const isOnline = Boolean(memoryTimestamp && now - memoryTimestamp < 45000);

    let lastActiveIso: string | undefined;
    if (memoryTimestamp) {
      lastActiveIso = new Date(memoryTimestamp).toISOString();
    } else if (fallbackLastCustomerMessageAt) {
      lastActiveIso = new Date(fallbackLastCustomerMessageAt).toISOString();
    } else if (fallbackCreatedAt) {
      lastActiveIso = new Date(fallbackCreatedAt).toISOString();
    }

    return {
      is_online: isOnline,
      last_active_at: lastActiveIso,
    };
  }

  /**
   * Enforces session-based and IP-based rate limiting
   */
  private checkRateLimit(sessionId: string, ip?: string) {
    const now = Date.now();

    // 1. Session check
    let sessionBucket = this.sessionRateMap.get(sessionId);
    if (!sessionBucket) {
      sessionBucket = { timestamps: [] };
      this.sessionRateMap.set(sessionId, sessionBucket);
    }
    sessionBucket.timestamps = sessionBucket.timestamps.filter((t) => now - t < this.WINDOW_MS);
    if (sessionBucket.timestamps.length >= this.SESSION_LIMIT) {
      throw new HttpException(
        'Rate limit exceeded. Maximum 10 messages per minute allowed per session.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. IP check
    if (ip) {
      let ipBucket = this.ipRateMap.get(ip);
      if (!ipBucket) {
        ipBucket = { timestamps: [] };
        this.ipRateMap.set(ip, ipBucket);
      }
      ipBucket.timestamps = ipBucket.timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (ipBucket.timestamps.length >= this.IP_LIMIT) {
        throw new HttpException(
          'IP rate limit exceeded. Please wait a minute before sending more messages.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      ipBucket.timestamps.push(now);
    }

    sessionBucket.timestamps.push(now);
  }

  /**
   * Initializes or returns existing session with message history
   */
  async getOrCreateSession(
    sessionId: string,
    customerId?: string,
    customerName?: string,
    customerEmail?: string,
    ip?: string,
  ) {
    let session = await this.prisma.chat_sessions.findUnique({
      where: { session_id: sessionId },
      include: {
        messages: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!session) {
      const defaultName = customerName || (customerId ? 'Valued Customer' : `Guest #${sessionId.slice(0, 5)}`);
      try {
        session = await this.prisma.chat_sessions.create({
          data: {
            session_id: sessionId,
            customer_id: customerId || null,
            customer_name: defaultName,
            customer_email: customerEmail || null,
            ip_address: ip || null,
            status: 'ACTIVE',
          },
          include: {
            messages: true,
          },
        });

        // Send initial luxury welcome message from Concierge Bot
        await this.prisma.chat_messages.create({
          data: {
            session_id: sessionId,
            sender_type: 'BOT',
            sender_name: 'Saba Concierge',
            message:
              'Assalamu Alaikum! Welcome to Saba Al Wadi Luxury Abayas. How can our styling consultants assist you today?',
          },
        });
      } catch {
        // Concurrently created by another request, will be retrieved below
      }

      session = await this.prisma.chat_sessions.findUnique({
        where: { session_id: sessionId },
        include: {
          messages: {
            orderBy: { created_at: 'asc' },
          },
        },
      });
    } else {
      // Update customer info if now logged in
      if (customerId && !session.customer_id) {
        await this.prisma.chat_sessions.update({
          where: { session_id: sessionId },
          data: {
            customer_id: customerId,
            customer_name: customerName || session.customer_name,
            customer_email: customerEmail || session.customer_email,
          },
        });
      }
    }

    return session;
  }

  /**
   * Fetch messages and live status for a session
   */
  async getMessages(sessionId: string, isCustomerCall = false) {
    if (isCustomerCall) {
      this.recordCustomerActivity(sessionId);
    }

    const session = await this.prisma.chat_sessions.findUnique({
      where: { session_id: sessionId },
      include: {
        messages: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    const lastCustomerMsg = session.messages
      ? [...session.messages].reverse().find((m) => m.sender_type === 'CUSTOMER')
      : null;
    const presence = this.getCustomerPresence(
      sessionId,
      lastCustomerMsg?.created_at,
      session.created_at,
    );

    return {
      ...session,
      is_online: presence.is_online,
      last_active_at: presence.last_active_at,
    };
  }

  /**
   * Customer sends message
   */
  async sendCustomerMessage(
    sessionId: string,
    message?: string,
    senderName?: string,
    ip?: string,
    attachmentUrl?: string,
    attachmentType?: string,
    attachmentName?: string,
  ) {
    if (!message?.trim() && !attachmentUrl) {
      throw new BadRequestException('Message or attachment is required.');
    }

    // 1. Rate limiting & presence update
    this.checkRateLimit(sessionId, ip);
    this.recordCustomerActivity(sessionId);

    // 2. Ensure session exists
    const session = await this.getOrCreateSession(sessionId, undefined, senderName, undefined, ip);

    // Determine attachment type if not explicitly passed
    let finalAttachType = attachmentType;
    if (attachmentUrl && !finalAttachType) {
      finalAttachType = /\.(jpeg|jpg|png|gif|webp|svg)($|\?)/i.test(attachmentUrl) ? 'image' : 'file';
    }

    // 3. Save message
    const customerMsg = await this.prisma.chat_messages.create({
      data: {
        session_id: sessionId,
        sender_type: 'CUSTOMER',
        sender_name: senderName || session?.customer_name || 'Customer',
        message: (message || '').trim(),
        attachment_url: attachmentUrl || null,
        attachment_type: finalAttachType || null,
        attachment_name: attachmentName || null,
      },
    });

    // 4. Update session counters & typing
    await this.prisma.chat_sessions.update({
      where: { session_id: sessionId },
      data: {
        unread_admin_count: { increment: 1 },
        is_customer_typing: false,
        last_message_at: new Date(),
        status: 'ACTIVE',
      },
    });

    // Real-Time Socket.IO broadcast
    this.realtimeGateway.emitChatMessage(sessionId, customerMsg);
    this.getAdminUnreadTotal().then((unread) => {
      this.realtimeGateway.emitChatUnreadCount(unread.unread_total);
    }).catch(() => {});

    // 5. Intelligent FAQ auto-guidance bot response
    const msgText = (message || '').toLowerCase();
    let botReply = '';
    if (msgText.includes('shipping') || msgText.includes('delivery')) {
      botReply = '✈ We offer Free Express Shipping across the UAE on all orders above 500 AED! Typical delivery takes 24-48 hours.';
    } else if (msgText.includes('size') || msgText.includes('measurement')) {
      botReply = '📏 Our abaya sizes standardly range from 52 (Petite) to 60 (Tall). You can check the size guide on each product page or our consultants can tailor custom lengths.';
    } else if (msgText.includes('return') || msgText.includes('exchange')) {
      botReply = '🔄 Saba Al Wadi provides an effortless 7-day return and exchange policy for unworn items with original luxury tags.';
    }

    if (botReply) {
      const botMsg = await this.prisma.chat_messages.create({
        data: {
          session_id: sessionId,
          sender_type: 'BOT',
          sender_name: 'Saba Concierge',
          message: botReply,
        },
      });
      this.realtimeGateway.emitChatMessage(sessionId, botMsg);
    }

    // 6. Automated Missed Chat Alert to Admins via Email
    // If all store administrators are inactive / offline, dispatch an instant email notification
    if (this.isAdminInactive()) {
      const lastEmailed = this.sessionLastEmailedMap.get(sessionId) || 0;
      // 3 minutes cooldown per session to avoid email flooding
      if (Date.now() - lastEmailed > 3 * 60 * 1000) {
        this.sessionLastEmailedMap.set(sessionId, Date.now());
        const sessionPayload = {
          session_id: sessionId,
          customer_name: session?.customer_name || senderName || 'Customer',
          customer_email: session?.customer_email || null,
        };
        this.mailService
          .sendCustomerChatMissedEmail(
            sessionPayload,
            (message || '').trim(),
            attachmentUrl,
          )
          .catch((err) =>
            this.logger.warn(`Failed to send missed chat notification email: ${err.message}`),
          );
      }

      // Friendly bot notice if consultants are away
      const lastNotified = this.sessionLastInactiveNoticeMap.get(sessionId) || 0;
      if (Date.now() - lastNotified > 15 * 60 * 1000) {
        this.sessionLastInactiveNoticeMap.set(sessionId, Date.now());
        await this.prisma.chat_messages.create({
          data: {
            session_id: sessionId,
            sender_type: 'BOT',
            sender_name: 'Saba Concierge',
            message:
              'Our styling consultants are currently away. We have dispatched your message to management via email and will reply shortly.',
          },
        });
      }
    }

    return customerMsg;
  }

  /**
   * Admin replies to session
   */
  async sendAdminReply(
    sessionId: string,
    message?: string,
    adminName = 'Support Consultant',
    attachmentUrl?: string,
    attachmentType?: string,
    attachmentName?: string,
    sendEmail = false,
  ) {
    this.recordAdminActivity();
    if (!message?.trim() && !attachmentUrl) {
      throw new BadRequestException('Message or attachment is required.');
    }

    const session = await this.prisma.chat_sessions.findUnique({
      where: { session_id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    let finalAttachType = attachmentType;
    if (attachmentUrl && !finalAttachType) {
      finalAttachType = /\.(jpeg|jpg|png|gif|webp|svg)($|\?)/i.test(attachmentUrl) ? 'image' : 'file';
    }

    const adminMsg = await this.prisma.chat_messages.create({
      data: {
        session_id: sessionId,
        sender_type: 'ADMIN',
        sender_name: adminName,
        message: (message || '').trim(),
        attachment_url: attachmentUrl || null,
        attachment_type: finalAttachType || null,
        attachment_name: attachmentName || null,
      },
    });

    await this.prisma.chat_sessions.update({
      where: { session_id: sessionId },
      data: {
        unread_customer_count: { increment: 1 },
        unread_admin_count: 0,
        is_admin_typing: false,
        last_message_at: new Date(),
      },
    });

    // Optional email copy to customer if admin enabled the option and customer has email
    if (sendEmail && session.customer_email) {
      this.mailService
        .sendAdminReplyToCustomerEmail(
          session.customer_email,
          session.customer_name || 'Valued Customer',
          (message || '').trim(),
          attachmentUrl,
          sessionId,
        )
        .catch((err) =>
          this.logger.warn(`Failed to send admin reply email to customer: ${err.message}`),
        );
    }

    // Real-Time Socket.IO broadcast to customer & admin
    this.realtimeGateway.emitChatMessage(sessionId, adminMsg);

    return adminMsg;
  }

  /**
   * Update typing status
   */
  async setTyping(sessionId: string, senderType: 'CUSTOMER' | 'ADMIN', isTyping: boolean) {
    if (senderType === 'CUSTOMER') {
      this.recordCustomerActivity(sessionId);
    } else {
      this.recordAdminActivity();
    }

    const data =
      senderType === 'CUSTOMER'
        ? { is_customer_typing: isTyping }
        : { is_admin_typing: isTyping };

    const updated = await this.prisma.chat_sessions.update({
      where: { session_id: sessionId },
      data,
    });

    try {
      this.realtimeGateway.server?.to(`session_${sessionId}`).emit('chat_typing', {
        session_id: sessionId,
        is_typing: isTyping,
        sender_type: senderType,
      });
      this.realtimeGateway.server?.to('admin').emit('chat_typing', {
        session_id: sessionId,
        is_typing: isTyping,
        sender_type: senderType,
      });
    } catch (_) {}

    return updated;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(sessionId: string, readerType: 'CUSTOMER' | 'ADMIN') {
    if (readerType === 'ADMIN') {
      this.recordAdminActivity();
      await this.prisma.chat_messages.updateMany({
        where: { session_id: sessionId, sender_type: 'CUSTOMER', is_read: false },
        data: { is_read: true },
      });
      const updated = await this.prisma.chat_sessions.update({
        where: { session_id: sessionId },
        data: { unread_admin_count: 0 },
      });
      const unread = await this.getAdminUnreadTotal();
      this.realtimeGateway.emitChatUnreadCount(unread.unread_total);
      return updated;
    } else {
      await this.prisma.chat_messages.updateMany({
        where: { session_id: sessionId, sender_type: { in: ['ADMIN', 'BOT'] }, is_read: false },
        data: { is_read: true },
      });
      return this.prisma.chat_sessions.update({
        where: { session_id: sessionId },
        data: { unread_customer_count: 0 },
      });
    }
  }

  /**
   * Admin: get all chat sessions with presence & last active status
   */
  async getAdminSessions() {
    this.recordAdminActivity();
    const sessions = await this.prisma.chat_sessions.findMany({
      orderBy: { last_message_at: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    return sessions.map((s) => {
      const lastMsgDate = s.messages?.[0]?.created_at;
      const presence = this.getCustomerPresence(s.session_id, lastMsgDate, s.created_at);
      return {
        ...s,
        is_online: presence.is_online,
        last_active_at: presence.last_active_at,
      };
    });
  }

  /**
   * Admin: get total unread count across all sessions
   */
  async getAdminUnreadTotal() {
    this.recordAdminActivity();
    const aggregate = await this.prisma.chat_sessions.aggregate({
      _sum: {
        unread_admin_count: true,
      },
    });
    return { unread_total: aggregate._sum.unread_admin_count || 0 };
  }

  /**
   * Delete single chat session and its messages
   */
  async deleteSession(sessionId: string) {
    await this.prisma.chat_messages.deleteMany({
      where: { session_id: sessionId },
    });

    const deleted = await this.prisma.chat_sessions.deleteMany({
      where: { session_id: sessionId },
    });

    this.customerActivityMap.delete(sessionId);
    this.sessionRateMap.delete(sessionId);
    this.sessionLastEmailedMap.delete(sessionId);
    this.sessionLastInactiveNoticeMap.delete(sessionId);

    this.realtimeGateway.emitSessionDeleted(sessionId);
    const unread = await this.getAdminUnreadTotal();
    this.realtimeGateway.emitChatUnreadCount(unread.unread_total);

    return { success: true, session_id: sessionId, deleted_count: deleted.count };
  }

  /**
   * Delete ALL chat sessions and their messages
   */
  async deleteAllSessions() {
    const deletedMsgs = await this.prisma.chat_messages.deleteMany({});
    const deletedSessions = await this.prisma.chat_sessions.deleteMany({});

    this.customerActivityMap.clear();
    this.sessionRateMap.clear();
    this.sessionLastEmailedMap.clear();
    this.sessionLastInactiveNoticeMap.clear();

    this.realtimeGateway.emitAllSessionsDeleted();
    this.realtimeGateway.emitChatUnreadCount(0);

    return {
      success: true,
      deleted_sessions: deletedSessions.count,
      deleted_messages: deletedMsgs.count,
    };
  }
}


import { Injectable, HttpException, HttpStatus, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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

  constructor(private prisma: PrismaService) {}

  /**
   * Record customer activity (presence heartbeat / message / poll)
   */
  recordCustomerActivity(sessionId: string) {
    if (!sessionId) return;
    this.customerActivityMap.set(sessionId, Date.now());
  }

  /**
   * Get presence information for a session
   * Considers customer online if active within last 45 seconds
   */
  getCustomerPresence(sessionId: string, sessionUpdatedAt?: Date | string) {
    const memoryTimestamp = this.customerActivityMap.get(sessionId);
    const dbTimestamp = sessionUpdatedAt ? new Date(sessionUpdatedAt).getTime() : 0;
    const lastActiveMs = memoryTimestamp || dbTimestamp || Date.now();

    // Online threshold: 45 seconds
    const isOnline = Date.now() - lastActiveMs < 45000;
    return {
      is_online: isOnline,
      last_active_at: new Date(lastActiveMs).toISOString(),
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

    const presence = this.getCustomerPresence(sessionId, session.updated_at);

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
      await this.prisma.chat_messages.create({
        data: {
          session_id: sessionId,
          sender_type: 'BOT',
          sender_name: 'Saba Concierge',
          message: botReply,
        },
      });
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
  ) {
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

    return adminMsg;
  }

  /**
   * Update typing status
   */
  async setTyping(sessionId: string, senderType: 'CUSTOMER' | 'ADMIN', isTyping: boolean) {
    if (senderType === 'CUSTOMER') {
      this.recordCustomerActivity(sessionId);
    }

    const data =
      senderType === 'CUSTOMER'
        ? { is_customer_typing: isTyping }
        : { is_admin_typing: isTyping };

    return this.prisma.chat_sessions.update({
      where: { session_id: sessionId },
      data,
    });
  }

  /**
   * Mark messages as read
   */
  async markAsRead(sessionId: string, readerType: 'CUSTOMER' | 'ADMIN') {
    if (readerType === 'ADMIN') {
      await this.prisma.chat_messages.updateMany({
        where: { session_id: sessionId, sender_type: 'CUSTOMER', is_read: false },
        data: { is_read: true },
      });
      return this.prisma.chat_sessions.update({
        where: { session_id: sessionId },
        data: { unread_admin_count: 0 },
      });
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
      const presence = this.getCustomerPresence(s.session_id, s.updated_at);
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
    const aggregate = await this.prisma.chat_sessions.aggregate({
      _sum: {
        unread_admin_count: true,
      },
    });
    return { unread_total: aggregate._sum.unread_admin_count || 0 };
  }
}

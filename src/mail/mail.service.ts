import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getTransporterAndFrom(): Promise<{
    transporter: nodemailer.Transporter | null;
    from: string;
    adminEmail: string;
    adminEmails: string[];
  }> {
    const settings = await this.prisma.site_settings.findMany({
      where: {
        key: {
          in: [
            'SMTP_HOST',
            'SMTP_PORT',
            'SMTP_USER',
            'SMTP_PASS',
            'SMTP_SECURE',
            'EMAIL_FROM',
            'ADMIN_EMAIL',
            'ADMIN_EMAILS',
          ],
        },
      },
    });
    const map = settings.reduce(
      (acc, s) => ({ ...acc, [s.key]: s.value }),
      {} as Record<string, string>
    );

    const host = (map['SMTP_HOST'] || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const port = Number(map['SMTP_PORT'] || process.env.SMTP_PORT || 587);
    const user = (map['SMTP_USER'] || process.env.SMTP_USER || '').trim();
    let pass = (map['SMTP_PASS'] || process.env.SMTP_PASS || '').trim();
    // Google App Passwords are shown in 4x4 groups like "abcd efgh ijkl mnop". Strip spaces for reliability.
    if (host.includes('gmail.com') && pass.includes(' ')) {
      pass = pass.replace(/\s+/g, '');
    }
    // Port 465 requires direct SSL/TLS (secure: true). Port 587 uses STARTTLS (secure: false).
    const secure = port === 465 ? true : (map['SMTP_SECURE'] || process.env.SMTP_SECURE) === 'true';
    const from =
      map['EMAIL_FROM'] ||
      process.env.EMAIL_FROM ||
      'Saba Al Wadi Abayas <no-reply@sabaalwadi.ae>';

    // Prioritize Privileged Admin Emails (ADMIN_EMAILS) from Settings
    const dbAdminEmails = (map['ADMIN_EMAILS'] || '').trim();
    const envAdminEmails = (process.env.ADMIN_EMAILS || '').trim();
    const dbAdminEmail = (map['ADMIN_EMAIL'] || '').trim();
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim();

    let candidateEmails = '';
    if (dbAdminEmails) {
      candidateEmails = dbAdminEmails;
    } else if (envAdminEmails) {
      candidateEmails = envAdminEmails;
    } else if (dbAdminEmail && dbAdminEmail !== 'admin@sabaalwadi.ae') {
      candidateEmails = dbAdminEmail;
    } else if (envAdminEmail) {
      candidateEmails = envAdminEmail;
    } else if (dbAdminEmail) {
      candidateEmails = dbAdminEmail;
    } else if (user && user.includes('@')) {
      candidateEmails = user;
    } else {
      candidateEmails = 'admin@sabaalwadi.ae';
    }

    const parsedList = candidateEmails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => Boolean(e) && e.includes('@'));

    const adminEmails = parsedList.length > 0 ? parsedList : ['admin@sabaalwadi.ae'];
    const adminEmail = adminEmails[0];

    if (user && pass && pass !== 'demo_app_password') {
      try {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
          connectionTimeout: 10000,
        });
        return { transporter, from, adminEmail, adminEmails };
      } catch (err: any) {
        this.logger.warn(`Failed to create SMTP transporter: ${err.message}`);
      }
    }
    return { transporter: null, from, adminEmail, adminEmails };
  }

  async verifySmtp(customConfig?: {
    host?: string;
    port?: number | string;
    user?: string;
    pass?: string;
    secure?: boolean | string;
  }): Promise<{ success: boolean; message: string }> {
    let host = customConfig?.host;
    let port = customConfig?.port ? Number(customConfig.port) : undefined;
    let user = customConfig?.user?.trim();
    let pass = customConfig?.pass?.trim();
    let secure = customConfig?.secure === true || customConfig?.secure === 'true';

    if (!host || !user || !pass) {
      const dbSettings = await this.prisma.site_settings.findMany({
        where: {
          key: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'] },
        },
      });
      const map = dbSettings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
      host = host || map['SMTP_HOST'] || 'smtp.gmail.com';
      port = port || Number(map['SMTP_PORT'] || 587);
      user = user || map['SMTP_USER'] || '';
      pass = pass || map['SMTP_PASS'] || '';
      secure = port === 465 ? true : (map['SMTP_SECURE'] === 'true');
    }

    if (!user || !pass) {
      return { success: false, message: 'SMTP Username and Password/App Secret are required.' };
    }

    if (host.includes('gmail.com') && pass.includes(' ')) {
      pass = pass.replace(/\s+/g, '');
    }
    if (port === 465) secure = true;

    try {
      const transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure,
        auth: { user, pass },
        connectionTimeout: 10000,
      });
      await transporter.verify();
      return { success: true, message: `SMTP connected and authenticated successfully with ${host}:${port}!` };
    } catch (err: any) {
      return { success: false, message: err.message || 'SMTP authentication failed' };
    }
  }

  // ─── Central Email Dispatcher with Detailed Logging & Retry ───

  async dispatchMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    cc?: string;
    bcc?: string;
    existingLogId?: string;
  }): Promise<{ success: boolean; error?: string; logId?: string }> {
    const { to, subject, html, text, cc, bcc, existingLogId } = options;
    let logRecord: any = null;

    try {
      if (existingLogId) {
        logRecord = await (this.prisma as any).email_logs.update({
          where: { id: existingLogId },
          data: {
            attempts: { increment: 1 },
            last_attempt: new Date(),
            status: 'PENDING',
          },
        });
      } else {
        logRecord = await (this.prisma as any).email_logs.create({
          data: {
            to,
            cc: cc || null,
            bcc: bcc || null,
            subject,
            body_html: html,
            body_text: text || null,
            status: 'PENDING',
            attempts: 1,
            last_attempt: new Date(),
          },
        });
      }
    } catch (dbErr: any) {
      this.logger.error(`Failed to record email_log in database: ${dbErr.message}`);
    }

    const { transporter, from } = await this.getTransporterAndFrom();

    if (!transporter) {
      const errMessage = 'SMTP transporter not configured. Please configure SMTP host, user, and password in Site Settings.';
      this.logger.warn(`Cannot send email to ${to}: ${errMessage}`);
      if (logRecord?.id) {
        try {
          await (this.prisma as any).email_logs.update({
            where: { id: logRecord.id },
            data: { status: 'FAILED', error: errMessage },
          });
        } catch (_) {}
      }
      return { success: false, error: errMessage, logId: logRecord?.id };
    }

    try {
      await transporter.sendMail({
        from,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        html,
        text: text || undefined,
      });

      this.logger.log(`Email dispatched successfully to ${to} [Subject: "${subject}"]`);

      if (logRecord?.id) {
        try {
          await (this.prisma as any).email_logs.update({
            where: { id: logRecord.id },
            data: { status: 'SENT', error: null },
          });
        } catch (_) {}
      }

      return { success: true, logId: logRecord?.id };
    } catch (err: any) {
      this.logger.error(`SMTP send failure to ${to}: ${err.message}`);

      if (logRecord?.id) {
        try {
          await (this.prisma as any).email_logs.update({
            where: { id: logRecord.id },
            data: { status: 'FAILED', error: err.message || String(err) },
          });
        } catch (_) {}
      }

      return { success: false, error: err.message, logId: logRecord?.id };
    }
  }

  async retryEmail(id: string): Promise<{ success: boolean; message: string; error?: string }> {
    const log = await (this.prisma as any).email_logs.findUnique({
      where: { id },
    });

    if (!log) {
      return { success: false, message: `Email log with ID ${id} not found.` };
    }

    const result = await this.dispatchMail({
      to: log.to,
      subject: log.subject,
      html: log.body_html,
      text: log.body_text || undefined,
      cc: log.cc || undefined,
      bcc: log.bcc || undefined,
      existingLogId: log.id,
    });

    return {
      success: result.success,
      message: result.success
        ? `Email successfully re-dispatched to ${log.to}!`
        : `Email retry failed: ${result.error}`,
      error: result.error,
    };
  }

  async getEmailLogs(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'ALL') {
      where.status = query.status.toUpperCase();
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { to: { contains: q, mode: 'insensitive' } },
        { cc: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { error: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).email_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).email_logs.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async clearEmailLogs() {
    await (this.prisma as any).email_logs.deleteMany();
    return { success: true, message: 'All email logs cleared successfully.' };
  }

  async sendOtpEmail(email: string, otp: string, firstName: string): Promise<boolean> {
    const subject = `Your Saba Al Wadi Verification Code: ${otp}`;
    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0c0a09; color: #f5f5f4; border: 1px solid #292524; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 2px;">SABA AL WADI</h1>
          <p style="color: #a8a29e; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 5px;">Luxury Emirati Abayas</p>
        </div>
        <div style="background-color: #1c1917; padding: 25px; border-radius: 6px; border: 1px solid #44403c;">
          <p style="font-size: 15px; color: #e7e5e4; margin-top: 0;">Dear ${firstName},</p>
          <p style="font-size: 13px; color: #a8a29e; line-height: 1.6;">Thank you for creating an account with Saba Al Wadi. Please use the following One-Time Password (OTP) to verify your email address and activate your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #d4af37; background-color: #0c0a09; padding: 12px 28px; border: 1px dashed #d4af37; border-radius: 4px;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #78716c; margin-bottom: 0;">This code is valid for <strong>10 minutes</strong>. If you did not request this verification, please disregard this email.</p>
        </div>
        <div style="text-align: center; margin-top: 25px; font-size: 11px; color: #57534e;">
          &copy; ${new Date().getFullYear()} Saba Al Wadi Couture LLC. Dubai, United Arab Emirates.
        </div>
      </div>
    `;

    // Always log OTP for development convenience
    this.logger.log(`\n========================================\n[EMAIL OTP] To: ${email} | OTP: ${otp}\n========================================`);

    await this.dispatchMail({
      to: email,
      subject,
      html,
      text: `Your Saba Al Wadi OTP is: ${otp}`,
    });

    return true;
  }

  async sendPasswordResetEmail(email: string, otp: string, firstName: string): Promise<boolean> {
    const subject = `Password Reset Request - Saba Al Wadi [Code: ${otp}]`;
    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0c0a09; color: #f5f5f4; border: 1px solid #292524; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 2px;">SABA AL WADI</h1>
          <p style="color: #a8a29e; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 5px;">Password Reset Verification</p>
        </div>
        <div style="background-color: #1c1917; padding: 25px; border-radius: 6px; border: 1px solid #44403c;">
          <p style="font-size: 15px; color: #e7e5e4; margin-top: 0;">Dear ${firstName || 'Customer'},</p>
          <p style="font-size: 13px; color: #a8a29e; line-height: 1.6;">We received a request to reset your Saba Al Wadi account password. Please use the following 6-digit verification code:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #d4af37; background-color: #0c0a09; padding: 12px 28px; border: 1px dashed #d4af37; border-radius: 4px;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #78716c; margin-bottom: 0;">This code is valid for <strong>15 minutes</strong>. If you did not request a password reset, you can safely ignore this email; your account remains secure.</p>
        </div>
        <div style="text-align: center; margin-top: 25px; font-size: 11px; color: #57534e;">
          &copy; ${new Date().getFullYear()} Saba Al Wadi Couture LLC. Dubai, United Arab Emirates.
        </div>
      </div>
    `;

    this.logger.log(`\n========================================\n[PASSWORD RESET OTP] To: ${email} | OTP: ${otp}\n========================================`);

    await this.dispatchMail({
      to: email,
      subject,
      html,
      text: `Your Saba Al Wadi Password Reset OTP is: ${otp}`,
    });

    return true;
  }

  async sendOrderConfirmation(
    email: string,
    firstName: string,
    order: { order_number: string; total: any; currency?: string; items?: any[]; status?: string },
  ): Promise<boolean> {
    const { transporter, from } = await this.getTransporterAndFrom();
    const subject = `Order Confirmed: #${order.order_number} - Saba Al Wadi Luxury Abayas`;
    const currency = order.currency || 'AED';
    const totalFormatted = Number(order.total || 0).toFixed(2);

    const itemsHtml = (order.items || [])
      .map(
        (it) => `
        <tr style="border-bottom: 1px solid #292524;">
          <td style="padding: 10px 0; color: #f5f5f4;">${it.product_name || 'Abaya'} <span style="color: #a8a29e; font-size: 11px;">(${it.variant_name || ''})</span></td>
          <td style="padding: 10px 0; text-align: center; color: #a8a29e;">x${it.quantity}</td>
          <td style="padding: 10px 0; text-align: right; color: #d4af37; font-weight: bold;">${Number(it.subtotal || it.price || 0).toFixed(2)} ${currency}</td>
        </tr>
      `,
      )
      .join('');

    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0c0a09; color: #f5f5f4; border: 1px solid #292524; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 2px;">SABA AL WADI</h1>
          <p style="color: #a8a29e; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 5px;">Luxury Emirati Abayas</p>
        </div>
        <div style="background-color: #1c1917; padding: 25px; border-radius: 6px; border: 1px solid #44403c;">
          <h2 style="color: #d4af37; margin-top: 0; font-size: 18px;">Thank You for Your Order!</h2>
          <p style="font-size: 14px; color: #e7e5e4;">Dear ${firstName},</p>
          <p style="font-size: 13px; color: #a8a29e; line-height: 1.6;">Your order <strong>#${order.order_number}</strong> has been received and is being prepared with artisanal care by our master tailors.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid #44403c; color: #a8a29e; text-align: left;">
                <th style="padding-bottom: 8px;">Item</th>
                <th style="padding-bottom: 8px; text-align: center;">Qty</th>
                <th style="padding-bottom: 8px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding-top: 15px; font-weight: bold; color: #f5f5f4; font-size: 15px;">Total Paid:</td>
                <td style="padding-top: 15px; text-align: right; font-weight: bold; color: #d4af37; font-size: 16px;">${totalFormatted} ${currency}</td>
              </tr>
            </tfoot>
          </table>
          <p style="font-size: 12px; color: #78716c; margin-bottom: 0;">We will notify you immediately once your package has shipped via Express courier.</p>
        </div>
        <div style="text-align: center; margin-top: 25px; font-size: 11px; color: #57534e;">
          &copy; ${new Date().getFullYear()} Saba Al Wadi Couture LLC. Dubai, United Arab Emirates.
        </div>
      </div>
    `;

    this.logger.log(`\n========================================\n[ORDER EMAIL TO CUSTOMER] To: ${email} | Order: ${order.order_number} | Total: ${totalFormatted} ${currency}\n========================================`);

    await this.dispatchMail({
      to: email,
      subject,
      html,
    });
    return true;
  }

  async sendAdminNewOrderNotification(order: any): Promise<boolean> {
    const { adminEmail, adminEmails } = await this.getTransporterAndFrom();
    const recipientEmails = adminEmails && adminEmails.length > 0 ? adminEmails : [adminEmail];
    const recipients = recipientEmails.join(', ');
    const subject = `🚨 NEW ORDER RECEIVED: #${order.order_number} - Total ${Number(order.total || 0).toFixed(2)} AED`;
    const currency = order.currency || 'AED';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; background-color: #18181b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 8px;">
        <h2 style="color: #fbbf24; margin-top: 0;">New Luxury Order Alert!</h2>
        <p style="color: #d4d4d8; font-size: 14px;">A new customer order has been placed on the storefront.</p>
        <div style="background-color: #27272a; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0; font-size: 14px;"><strong>Order ID:</strong> #${order.order_number}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Total Value:</strong> <span style="color: #34d399; font-weight: bold;">${Number(order.total || 0).toFixed(2)} ${currency}</span></p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Status:</strong> ${order.status}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Customer:</strong> ${order.customer?.first_name || 'Customer'} (${order.customer?.email || 'N/A'})</p>
        </div>
        <p style="font-size: 13px; color: #a1a1aa;">Please log into the Admin Dashboard to review and fulfill this order.</p>
      </div>
    `;

    this.logger.log(`\n========================================\n[ORDER EMAIL TO ADMIN] To: ${recipients} | Order: ${order.order_number}\n========================================`);

    await this.dispatchMail({
      to: recipients,
      subject,
      html,
    });
    return true;
  }

  async sendAdminNewReviewNotification(review: any, product: any): Promise<boolean> {
    const { adminEmail, adminEmails } = await this.getTransporterAndFrom();
    const recipientEmails = adminEmails && adminEmails.length > 0 ? adminEmails : [adminEmail];
    const recipients = recipientEmails.join(', ');
    const subject = `⭐ NEW PRODUCT REVIEW: ${review.rating}★ for "${product?.name || 'Product'}"`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; background-color: #18181b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 8px;">
        <h2 style="color: #fbbf24; margin-top: 0;">New Product Review Received!</h2>
        <div style="background-color: #27272a; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0; font-size: 14px;"><strong>Product:</strong> ${product?.name || 'Abaya'}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Rating:</strong> <span style="color: #fbbf24; font-weight: bold;">${review.rating} / 5 Stars</span></p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Review:</strong> ${review.review || '(No written review text)'}</p>
        </div>
        <p style="font-size: 13px; color: #a1a1aa;">Please log into the Admin Dashboard to moderate reviews.</p>
      </div>
    `;

    this.logger.log(`\n========================================\n[REVIEW EMAIL TO ADMIN] To: ${recipients} | Rating: ${review.rating}★\n========================================`);

    await this.dispatchMail({
      to: recipients,
      subject,
      html,
    });
    return true;
  }

  async sendAdminNewBlogCommentNotification(comment: any, blog: any): Promise<boolean> {
    const { adminEmail, adminEmails } = await this.getTransporterAndFrom();
    const recipientEmails = adminEmails && adminEmails.length > 0 ? adminEmails : [adminEmail];
    const recipients = recipientEmails.join(', ');
    const subject = `💬 NEW BLOG COMMENT: on "${blog?.title || 'Article'}"`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; background-color: #18181b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 8px;">
        <h2 style="color: #fbbf24; margin-top: 0;">New Blog Comment Received!</h2>
        <div style="background-color: #27272a; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0; font-size: 14px;"><strong>Blog Post:</strong> ${blog?.title || 'Article'}</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Author:</strong> ${comment.author_name} (${comment.author_email})</p>
          <p style="margin: 5px 0; font-size: 14px;"><strong>Comment:</strong> ${comment.content}</p>
        </div>
        <p style="font-size: 13px; color: #a1a1aa;">Please log into the Admin Dashboard to moderate comments.</p>
      </div>
    `;

    this.logger.log(`\n========================================\n[BLOG COMMENT EMAIL TO ADMIN] To: ${recipients} | Author: ${comment.author_name}\n========================================`);

    await this.dispatchMail({
      to: recipients,
      subject,
      html,
    });
    return true;
  }

  async sendOrderStatusUpdateEmail(
    email: string,
    firstName: string,
    orderNumber: string,
    newStatus: string,
    deliveryPartner?: string,
    trackingNumber?: string,
    trackingUrl?: string,
  ): Promise<boolean> {
    const subject = `Order Update: #${orderNumber} is now ${newStatus}`;

    const trackingHtml = trackingNumber || deliveryPartner ? `
      <div style="background-color: #27272a; padding: 15px; border-radius: 6px; margin: 15px 0; border: 1px solid #3f3f46;">
        <h4 style="color: #38bdf8; margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Shipment Tracking Information</h4>
        ${deliveryPartner ? `<p style="margin: 4px 0; font-size: 13px; color: #f4f4f5;"><strong>Delivery Courier:</strong> ${deliveryPartner}</p>` : ''}
        ${trackingNumber ? `<p style="margin: 4px 0; font-size: 13px; color: #f4f4f5;"><strong>Tracking Number:</strong> <code style="color: #a7f3d0; background: #064e3b; padding: 2px 6px; border-radius: 3px;">${trackingNumber}</code></p>` : ''}
        ${trackingUrl ? `<div style="margin-top: 10px;"><a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 12px; font-weight: bold; padding: 8px 16px; border-radius: 4px;">Track Shipment Live &rarr;</a></div>` : ''}
      </div>
    ` : '';

    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0c0a09; color: #f5f5f4; border: 1px solid #292524; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 2px;">SABA AL WADI</h1>
        </div>
        <div style="background-color: #1c1917; padding: 25px; border-radius: 6px; border: 1px solid #44403c;">
          <p style="font-size: 14px; color: #e7e5e4;">Dear ${firstName},</p>
          <p style="font-size: 13px; color: #a8a29e; line-height: 1.6;">Your order <strong>#${orderNumber}</strong> status has been updated to:</p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="display: inline-block; font-size: 16px; font-weight: bold; letter-spacing: 2px; color: #10b981; background-color: #064e3b; padding: 10px 24px; border-radius: 4px;">${newStatus}</span>
          </div>
          ${trackingHtml}
          <p style="font-size: 12px; color: #78716c; margin-top: 15px;">If you have any questions, our Concierge Support is always here to assist you.</p>
        </div>
      </div>
    `;

    this.logger.log(`\n========================================\n[STATUS UPDATE EMAIL] To: ${email} | Order: ${orderNumber} | Status: ${newStatus} | Courier: ${deliveryPartner || 'N/A'}\n========================================`);

    await this.dispatchMail({
      to: email,
      subject,
      html,
    });
    return true;
  }

  async sendProductStatusUpdateEmail(
    productName: string,
    newStatus: string,
  ): Promise<boolean> {
    const { adminEmail, adminEmails } = await this.getTransporterAndFrom();
    const recipients = (adminEmails && adminEmails.length > 0 ? adminEmails : [adminEmail]).join(', ');
    this.logger.log(`\n========================================\n[PRODUCT STATUS NOTIFICATION] Product: "${productName}" is now ${newStatus} | To: ${recipients}\n========================================`);
    return true;
  }

  async sendCustomerChatMissedEmail(
    session: {
      session_id: string;
      customer_name?: string | null;
      customer_email?: string | null;
    },
    message: string,
    attachmentUrl?: string | null,
  ): Promise<boolean> {
    const { adminEmail, adminEmails } = await this.getTransporterAndFrom();
    const recipientEmails = adminEmails && adminEmails.length > 0 ? adminEmails : [adminEmail];
    const customerDisplayName = session.customer_name || 'Customer';
    const customerEmailStr = session.customer_email || 'Not provided';
    const subject = `💬 [MISSED CHAT] Inactive Admin Alert: New message from ${customerDisplayName} (${session.session_id.slice(0, 8)})`;

    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; background-color: #18181b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 8px;">
        <div style="border-bottom: 1px solid #3f3f46; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="color: #fbbf24; margin: 0; font-size: 18px;">⚠️ Missed Customer Chat Notification</h2>
          <p style="color: #a1a1aa; font-size: 12px; margin: 4px 0 0 0;">An inquiry was received while all store administrators were inactive / offline.</p>
        </div>
        
        <div style="background-color: #27272a; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Customer Name:</strong> <span style="color: #38bdf8;">${customerDisplayName}</span></p>
          <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Customer Email:</strong> <span style="color: #e4e4e7;">${customerEmailStr}</span></p>
          <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Chat Session ID:</strong> <code style="color: #d4af37; background: #000; padding: 2px 6px; border-radius: 4px;">${session.session_id}</code></p>
          <p style="margin: 0; font-size: 13px;"><strong>Time Received:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })} (UAE Time)</p>
        </div>

        <div style="background-color: #09090b; border-left: 4px solid #d4af37; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a1a1aa; font-weight: bold;">Customer Message:</p>
          <p style="margin: 0; font-size: 14px; color: #ffffff; line-height: 1.5; white-space: pre-wrap;">${message || '(Sent an attachment)'}</p>
          ${attachmentUrl ? `<p style="margin: 10px 0 0 0; font-size: 12px;"><a href="${attachmentUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline;">View Uploaded Attachment &rarr;</a></p>` : ''}
        </div>

        <div style="text-align: center; margin-top: 20px;">
          <a href="http://localhost:3000/admin/chat?session=${session.session_id}" style="display: inline-block; background-color: #d4af37; color: #000000; font-weight: bold; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 13px;">Open Admin Live Chat &rarr;</a>
        </div>

        <p style="font-size: 11px; color: #71717a; text-align: center; margin-top: 20px; margin-bottom: 0;">
          This automatic notification was dispatched because no store administrators have been active online in the past 60 seconds.
        </p>
      </div>
    `;

    this.logger.log(`\n========================================\n[MISSED CHAT EMAIL TO ADMIN] Recipients: ${recipientEmails.join(', ')} | Customer: ${customerDisplayName} | Msg: ${message}\n========================================`);

    await this.dispatchMail({
      to: recipientEmails.join(', '),
      subject,
      html,
    });
    return true;
  }

  async sendAdminReplyToCustomerEmail(
    customerEmail: string,
    customerName: string,
    replyMessage: string,
    attachmentUrl?: string | null,
    sessionId?: string,
  ): Promise<boolean> {
    const subject = `💬 Response to your inquiry - Saba Al Wadi Concierge`;

    const html = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0c0a09; color: #f5f5f4; border: 1px solid #292524; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 2px;">SABA AL WADI</h1>
          <p style="color: #a8a29e; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 5px;">Luxury Emirati Abayas</p>
        </div>
        <div style="background-color: #1c1917; padding: 25px; border-radius: 6px; border: 1px solid #44403c;">
          <h2 style="color: #d4af37; margin-top: 0; font-size: 16px;">Concierge Consultation Update</h2>
          <p style="font-size: 14px; color: #e7e5e4;">Dear ${customerName || 'Valued Customer'},</p>
          <p style="font-size: 13px; color: #a8a29e; line-height: 1.6;">Our styling consultant has replied to your inquiry:</p>
          
          <div style="background-color: #0c0a09; border-left: 3px solid #d4af37; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="font-size: 14px; color: #f5f5f4; margin: 0; line-height: 1.6; white-space: pre-wrap;">${replyMessage}</p>
            ${attachmentUrl ? `<p style="margin: 12px 0 0 0; font-size: 12px;"><a href="${attachmentUrl}" target="_blank" style="color: #d4af37; text-decoration: underline;">View Attached Document &rarr;</a></p>` : ''}
          </div>

          <div style="text-align: center; margin-top: 25px;">
            <a href="http://localhost:3000" style="display: inline-block; background-color: #d4af37; color: #0c0a09; text-decoration: none; font-size: 12px; font-weight: bold; padding: 10px 22px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">Continue Live Chat on Store</a>
          </div>

          <p style="font-size: 11px; color: #78716c; margin-top: 20px; margin-bottom: 0;">You can also simply reply directly to this chat session on our website.</p>
        </div>
        <div style="text-align: center; margin-top: 25px; font-size: 11px; color: #57534e;">
          &copy; ${new Date().getFullYear()} Saba Al Wadi Couture LLC. Dubai, United Arab Emirates.
        </div>
      </div>
    `;

    this.logger.log(`\n========================================\n[ADMIN REPLY EMAIL TO CUSTOMER] To: ${customerEmail} | Session: ${sessionId || 'N/A'}\n========================================`);

    await this.dispatchMail({
      to: customerEmail,
      subject,
      html,
    });
    return true;
  }
}


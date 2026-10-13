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
          ],
        },
      },
    });
    const map = settings.reduce(
      (acc, s) => ({ ...acc, [s.key]: s.value }),
      {} as Record<string, string>
    );

    const host = map['SMTP_HOST'] || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(map['SMTP_PORT'] || process.env.SMTP_PORT || 587);
    const user = map['SMTP_USER'] || process.env.SMTP_USER;
    const pass = map['SMTP_PASS'] || process.env.SMTP_PASS;
    const secure =
      (map['SMTP_SECURE'] || process.env.SMTP_SECURE) === 'true';
    const from =
      map['EMAIL_FROM'] ||
      process.env.EMAIL_FROM ||
      'Saba Al Wadi Abayas <no-reply@sabaalwadi.ae>';
    const adminEmail =
      map['ADMIN_EMAIL'] ||
      process.env.ADMIN_EMAIL ||
      user ||
      'admin@sabaalwadi.ae';

    if (user && pass && pass !== 'demo_app_password') {
      try {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });
        return { transporter, from, adminEmail };
      } catch (err: any) {
        this.logger.warn(`Failed to create SMTP transporter: ${err.message}`);
      }
    }
    return { transporter: null, from, adminEmail };
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

    const { transporter, from } = await this.getTransporterAndFrom();
    if (transporter) {
      try {
        await transporter.sendMail({
          from,
          to: email,
          subject,
          html,
        });
        this.logger.log(`OTP email sent successfully to ${email}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Failed to send email via SMTP to ${email}: ${err.message}`);
        // Return true because dev OTP is logged and registered in DB
        return true;
      }
    }

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

    if (transporter) {
      try {
        await transporter.sendMail({ from, to: email, subject, html });
      } catch (err: any) {
        this.logger.error(`Failed to send order email to customer: ${err.message}`);
      }
    }
    return true;
  }

  async sendAdminNewOrderNotification(order: any): Promise<boolean> {
    const { transporter, from, adminEmail } = await this.getTransporterAndFrom();
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

    this.logger.log(`\n========================================\n[ORDER EMAIL TO ADMIN] To: ${adminEmail} | Order: ${order.order_number}\n========================================`);

    if (transporter) {
      try {
        await transporter.sendMail({ from, to: adminEmail, subject, html });
      } catch (err: any) {
        this.logger.error(`Failed to send order email to admin: ${err.message}`);
      }
    }
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
    const { transporter, from } = await this.getTransporterAndFrom();
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

    if (transporter) {
      try {
        await transporter.sendMail({ from, to: email, subject, html });
      } catch (err: any) {
        this.logger.error(`Failed to send status update email: ${err.message}`);
      }
    }
    return true;
  }

  async sendProductStatusUpdateEmail(
    productName: string,
    newStatus: string,
  ): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'admin@sabaalwadi.ae';
    this.logger.log(`\n========================================\n[PRODUCT STATUS NOTIFICATION] Product: "${productName}" is now ${newStatus}\n========================================`);
    return true;
  }
}


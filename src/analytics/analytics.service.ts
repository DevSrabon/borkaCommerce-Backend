import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackVisit(data: {
    visitor_id?: string;
    ip_address?: string;
    user_agent?: string;
    page_url?: string;
  }) {
    try {
      const visitorId = data.visitor_id?.trim() || null;
      const ip = data.ip_address?.trim() || null;

      // Rate limit: If same visitor/IP was logged within last 10 minutes on same page, skip duplicate
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recent = await this.prisma.visitor_logs.findFirst({
        where: {
          created_at: { gte: tenMinsAgo },
          page_url: data.page_url || '/',
          OR: [
            ...(visitorId ? [{ visitor_id: visitorId }] : []),
            ...(ip ? [{ ip_address: ip }] : []),
          ],
        },
      });

      if (recent) {
        return { success: true, tracked: false, reason: 'debounced' };
      }

      await this.prisma.visitor_logs.create({
        data: {
          visitor_id: visitorId,
          ip_address: ip,
          user_agent: data.user_agent ? data.user_agent.slice(0, 500) : null,
          page_url: data.page_url ? data.page_url.slice(0, 500) : '/',
        },
      });

      return { success: true, tracked: true };
    } catch {
      return { success: false };
    }
  }

  async getVisitorStats() {
    const now = new Date();

    // Start of Today (local time)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Start of Current Week (Monday)
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);

    // Start of Current Month (1st)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRes, weekRes, monthRes, totalRes] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_address))::int as count 
        FROM visitor_logs 
        WHERE created_at >= $1::timestamp
      `, startOfDay.toISOString()),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_address))::int as count 
        FROM visitor_logs 
        WHERE created_at >= $1::timestamp
      `, startOfWeek.toISOString()),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_address))::int as count 
        FROM visitor_logs 
        WHERE created_at >= $1::timestamp
      `, startOfMonth.toISOString()),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_address))::int as count 
        FROM visitor_logs
      `),
    ]);

    return {
      today: todayRes[0]?.count ?? 0,
      current_week: weekRes[0]?.count ?? 0,
      current_month: monthRes[0]?.count ?? 0,
      total: totalRes[0]?.count ?? 0,
    };
  }
}

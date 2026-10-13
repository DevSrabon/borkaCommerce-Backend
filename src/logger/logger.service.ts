import { Injectable, LoggerService as INestLoggerService } from '@nestjs/common';
import { winstonLogger } from './logger.config';
import { PrismaService } from '../database/prisma.service';

export interface HttpLogEntry {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  query?: string;
  payload?: any;
  userAgent?: string;
  errorStack?: string;
}

@Injectable()
export class LoggerService implements INestLoggerService {
  constructor(private readonly prisma: PrismaService) {}

  log(message: string, ...meta: any[]) {
    winstonLogger.info(message, ...meta);
  }

  error(message: string, trace?: string, ...meta: any[]) {
    winstonLogger.error(message, { trace, ...meta });
  }

  warn(message: string, ...meta: any[]) {
    winstonLogger.warn(message, ...meta);
  }

  debug(message: string, ...meta: any[]) {
    winstonLogger.debug(message, ...meta);
  }

  // ─── Record HTTP Request (Winston File + Queryable Database) ─────────────

  async recordHttpLog(entry: HttpLogEntry) {
    const level = entry.statusCode >= 500 ? 'error' : entry.statusCode >= 400 ? 'warn' : 'info';

    // 1. Log to Winston rotating log file (30-day retention)
    winstonLogger.log({
      level,
      message: `${entry.method} ${entry.route} ${entry.statusCode} - ${entry.durationMs.toFixed(1)}ms`,
      ...entry,
    });

    // 2. Persist to Prisma system_logs for instant search, filtering, and most expensive analysis
    try {
      await this.prisma.system_logs.create({
        data: {
          level,
          method: entry.method,
          route: entry.route,
          status_code: entry.statusCode,
          duration_ms: Math.round(entry.durationMs * 10) / 10,
          ip: entry.ip || null,
          query: entry.query || null,
          payload: entry.payload ? JSON.stringify(entry.payload) : null,
          user_agent: entry.userAgent || null,
          error_stack: entry.errorStack || null,
        },
      });
    } catch (err: any) {
      winstonLogger.error('Failed to persist HTTP log to database', { error: err.message });
    }
  }

  // ─── Query Logs for Admin Dashboard ──────────────────────────────────────

  async getLogs(params: {
    search?: string;
    method?: string;
    statusCode?: number;
    level?: string;
    minDuration?: number;
    mostExpensive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.method && params.method !== 'ALL') {
      where.method = params.method.toUpperCase();
    }

    if (params.level && params.level !== 'ALL') {
      where.level = params.level.toLowerCase();
    }

    if (params.statusCode) {
      where.status_code = params.statusCode;
    }

    if (params.minDuration && params.minDuration > 0) {
      where.duration_ms = { gte: params.minDuration };
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { route: { contains: q, mode: 'insensitive' } },
        { query: { contains: q, mode: 'insensitive' } },
        { payload: { contains: q, mode: 'insensitive' } },
        { ip: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = params.mostExpensive
      ? { duration_ms: 'desc' }
      : { created_at: 'desc' };

    const [total, items] = await Promise.all([
      this.prisma.system_logs.count({ where }),
      this.prisma.system_logs.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Analytics / Stats for Admin Dashboard ───────────────────────────────

  async getLogStats() {
    const totalRequests = await this.prisma.system_logs.count();

    if (totalRequests === 0) {
      return {
        totalRequests: 0,
        avgDurationMs: 0,
        errorRate: 0,
        mostExpensiveRoutes: [],
        statusBreakdown: { ok: 0, clientError: 0, serverError: 0 },
      };
    }

    const [errorCount, avgAgg, slowest] = await Promise.all([
      this.prisma.system_logs.count({ where: { status_code: { gte: 400 } } }),
      this.prisma.system_logs.aggregate({ _avg: { duration_ms: true } }),
      this.prisma.system_logs.findMany({
        orderBy: { duration_ms: 'desc' },
        take: 5,
        select: {
          id: true,
          method: true,
          route: true,
          duration_ms: true,
          status_code: true,
          created_at: true,
        },
      }),
    ]);

    const okCount = await this.prisma.system_logs.count({
      where: { status_code: { gte: 200, lt: 300 } },
    });
    const clientErrCount = await this.prisma.system_logs.count({
      where: { status_code: { gte: 400, lt: 500 } },
    });
    const serverErrCount = await this.prisma.system_logs.count({
      where: { status_code: { gte: 500 } },
    });

    return {
      totalRequests,
      avgDurationMs: Math.round((avgAgg._avg.duration_ms || 0) * 10) / 10,
      errorRate: Math.round((errorCount / totalRequests) * 1000) / 10,
      mostExpensiveRoutes: slowest,
      statusBreakdown: {
        ok: okCount,
        clientError: clientErrCount,
        serverError: serverErrCount,
      },
    };
  }

  async clearLogs() {
    await this.prisma.system_logs.deleteMany();
    return { success: true, message: 'System logs cleared from database' };
  }
}

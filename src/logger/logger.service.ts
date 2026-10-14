import { Injectable, LoggerService as INestLoggerService } from '@nestjs/common';
import { winstonLogger } from './logger.config';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

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

export interface ParsedLogItem {
  id: string;
  level: string;
  method: string;
  route: string;
  status_code: number;
  duration_ms: number;
  ip: string | null;
  query: string | null;
  payload: string | null;
  user_agent: string | null;
  error_stack: string | null;
  created_at: string;
}

@Injectable()
export class LoggerService implements INestLoggerService {
  private readonly logDir = path.resolve(process.cwd(), 'logs');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

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

  // ─── Record HTTP Request (Winston File Only, Exclude OPTIONS and /logs, NO DB) ─────────────

  async recordHttpLog(entry: HttpLogEntry) {
    if (!entry) return;

    const upperMethod = (entry.method || '').toUpperCase();
    const route = entry.route || '';

    // User requirement:
    // "options, logs routes save hobe na. db te logs save hobe na."
    if (
      upperMethod === 'OPTIONS' ||
      route.includes('/logs') ||
      route.startsWith('/admin/logs')
    ) {
      return;
    }

    const level = entry.statusCode >= 500 ? 'error' : entry.statusCode >= 400 ? 'warn' : 'info';
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Log exclusively to Winston daily rotating files in the logs folder
    winstonLogger.log({
      id,
      level,
      message: `${upperMethod} ${route} ${entry.statusCode} - ${entry.durationMs.toFixed(1)}ms`,
      method: upperMethod,
      route,
      statusCode: entry.statusCode,
      durationMs: Math.round(entry.durationMs * 10) / 10,
      ip: entry.ip || null,
      query: entry.query || null,
      payload: entry.payload ? (typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload)) : null,
      userAgent: entry.userAgent || null,
      errorStack: entry.errorStack || null,
      timestamp: new Date().toISOString(),
    });

    // NOTE: Database persistence is completely skipped per user request ("db te logs save hobe na")
  }

  // ─── Read & Parse Winston Log Files from logs/ Folder ─────────────────────

  private readWinstonLogs(): ParsedLogItem[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    const files = fs.readdirSync(this.logDir);
    // Prefer http-*.log files which record HTTP traffic, sorted by modification date descending
    const httpFiles = files
      .filter((f) => f.startsWith('http-') && f.endsWith('.log'))
      .sort((a, b) => b.localeCompare(a));

    const combinedFiles = files
      .filter((f) => f.startsWith('combined-') && f.endsWith('.log'))
      .sort((a, b) => b.localeCompare(a));

    const filesToRead = httpFiles.length > 0 ? httpFiles : combinedFiles;
    const allLogs: ParsedLogItem[] = [];
    const seenIds = new Set<string>();

    for (const fileName of filesToRead) {
      const filePath = path.join(this.logDir, fileName);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content || !content.trim()) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const raw = JSON.parse(line);

            const method = (raw.method || 'GET').toUpperCase();
            const route = raw.route || '';

            // User requirement: Exclude OPTIONS and logs routes
            if (
              method === 'OPTIONS' ||
              route.includes('/logs') ||
              route.startsWith('/admin/logs')
            ) {
              continue;
            }

            const timestamp = raw.timestamp || raw['@timestamp'] || new Date().toISOString();
            const durationMs = typeof raw.durationMs === 'number'
              ? Math.round(raw.durationMs * 10) / 10
              : typeof raw.duration_ms === 'number'
              ? raw.duration_ms
              : 0;

            const id = raw.id || `win_${Buffer.from(`${timestamp}_${route}_${i}`).toString('hex').slice(0, 16)}`;

            if (seenIds.has(id)) continue;
            seenIds.add(id);

            allLogs.push({
              id,
              level: raw.level || (raw.statusCode >= 500 ? 'error' : raw.statusCode >= 400 ? 'warn' : 'info'),
              method,
              route: route || '/',
              status_code: raw.statusCode || raw.status_code || 200,
              duration_ms: durationMs,
              ip: raw.ip || null,
              query: raw.query || null,
              payload: raw.payload ? (typeof raw.payload === 'string' ? raw.payload : JSON.stringify(raw.payload)) : null,
              user_agent: raw.userAgent || raw.user_agent || null,
              error_stack: raw.errorStack || raw.stack || raw.trace || null,
              created_at: timestamp,
            });
          } catch (_) {
            // Ignore corrupted lines
          }
        }
      } catch (err: any) {
        winstonLogger.error(`Error reading log file ${fileName}: ${err.message}`);
      }
    }

    return allLogs;
  }

  // ─── Query Logs for Admin Dashboard (From Winston Log Files) ──────────────

  async getLogs(params: {
    search?: string;
    method?: string;
    statusCode?: number;
    statusGroup?: string;
    level?: string;
    minDuration?: number;
    sort?: string; // 'newest' | 'oldest' | 'slowest' | 'fastest' | 'status_desc' | 'status_asc' | 'asc' | 'desc'
    mostExpensive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));

    let logs = this.readWinstonLogs();

    // 1. Method Filter
    if (params.method && params.method !== 'ALL') {
      const targetMethod = params.method.toUpperCase();
      logs = logs.filter((l) => l.method === targetMethod);
    }

    // 2. Level Filter
    if (params.level && params.level !== 'ALL') {
      const targetLevel = params.level.toLowerCase();
      logs = logs.filter((l) => l.level.toLowerCase() === targetLevel);
    }

    // 3. Status Filter
    if (params.statusCode) {
      logs = logs.filter((l) => l.status_code === params.statusCode);
    } else if (params.statusGroup && params.statusGroup !== 'ALL') {
      switch (params.statusGroup.toLowerCase()) {
        case '2xx':
          logs = logs.filter((l) => l.status_code >= 200 && l.status_code < 300);
          break;
        case '3xx':
          logs = logs.filter((l) => l.status_code >= 300 && l.status_code < 400);
          break;
        case '4xx':
          logs = logs.filter((l) => l.status_code >= 400 && l.status_code < 500);
          break;
        case '5xx':
          logs = logs.filter((l) => l.status_code >= 500);
          break;
        case 'errors':
          logs = logs.filter((l) => l.status_code >= 400);
          break;
      }
    }

    // 4. Min Duration Filter
    if (params.minDuration && params.minDuration > 0) {
      logs = logs.filter((l) => l.duration_ms >= params.minDuration!);
    }

    // 5. Search Filter (Route, Query, Payload, IP, User-Agent, Error Stack, Method)
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      logs = logs.filter((l) => {
        return (
          l.route.toLowerCase().includes(q) ||
          (l.query && l.query.toLowerCase().includes(q)) ||
          (l.payload && l.payload.toLowerCase().includes(q)) ||
          (l.ip && l.ip.toLowerCase().includes(q)) ||
          (l.user_agent && l.user_agent.toLowerCase().includes(q)) ||
          (l.error_stack && l.error_stack.toLowerCase().includes(q)) ||
          l.method.toLowerCase().includes(q)
        );
      });
    }

    // 6. Sorting (asc, desc, slowest, creation)
    const sort = (params.sort || (params.mostExpensive ? 'slowest' : 'newest')).toLowerCase();

    logs.sort((a, b) => {
      switch (sort) {
        case 'oldest':
        case 'creation_asc':
        case 'asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'slowest':
        case 'duration_desc':
          return b.duration_ms - a.duration_ms;
        case 'fastest':
        case 'duration_asc':
          return a.duration_ms - b.duration_ms;
        case 'status_desc':
          return b.status_code - a.status_code;
        case 'status_asc':
          return a.status_code - b.status_code;
        case 'newest':
        case 'creation_desc':
        case 'desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    const total = logs.length;
    const skip = (page - 1) * limit;
    const items = logs.slice(skip, skip + limit);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ─── Single Log Inspector (From Winston Files) ────────────────────────────

  async getLogById(id: string): Promise<ParsedLogItem | null> {
    const logs = this.readWinstonLogs();
    const found = logs.find((l) => l.id === id);
    return found || null;
  }

  // ─── Analytics / Stats for Admin Dashboard (From Winston Files) ───────────

  async getLogStats() {
    const logs = this.readWinstonLogs();
    const totalRequests = logs.length;

    if (totalRequests === 0) {
      return {
        totalRequests: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
        errorRate: 0,
        mostExpensiveRoutes: [],
        statusBreakdown: { ok: 0, redirect: 0, clientError: 0, serverError: 0 },
        methodBreakdown: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, OTHER: 0 },
      };
    }

    let totalDuration = 0;
    let maxDuration = 0;
    let errorCount = 0;
    let okCount = 0;
    let redirectCount = 0;
    let clientErrCount = 0;
    let serverErrCount = 0;

    const methodCounts: Record<string, number> = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, OTHER: 0 };

    for (const log of logs) {
      totalDuration += log.duration_ms;
      if (log.duration_ms > maxDuration) {
        maxDuration = log.duration_ms;
      }

      if (log.status_code >= 200 && log.status_code < 300) {
        okCount++;
      } else if (log.status_code >= 300 && log.status_code < 400) {
        redirectCount++;
      } else if (log.status_code >= 400 && log.status_code < 500) {
        clientErrCount++;
        errorCount++;
      } else if (log.status_code >= 500) {
        serverErrCount++;
        errorCount++;
      }

      if (methodCounts[log.method] !== undefined) {
        methodCounts[log.method]++;
      } else {
        methodCounts.OTHER++;
      }
    }

    // Top 5 Slowest endpoints
    const slowest = [...logs]
      .sort((a, b) => b.duration_ms - a.duration_ms)
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        method: l.method,
        route: l.route,
        duration_ms: l.duration_ms,
        status_code: l.status_code,
        created_at: l.created_at,
      }));

    return {
      totalRequests,
      avgDurationMs: Math.round((totalDuration / totalRequests) * 10) / 10,
      maxDurationMs: Math.round(maxDuration * 10) / 10,
      errorRate: Math.round((errorCount / totalRequests) * 1000) / 10,
      mostExpensiveRoutes: slowest,
      statusBreakdown: {
        ok: okCount,
        redirect: redirectCount,
        clientError: clientErrCount,
        serverError: serverErrCount,
      },
      methodBreakdown: methodCounts,
    };
  }

  // ─── Clear Logs (Truncates Winston log files, purges DB if any leftover) ───

  async clearLogs() {
    let clearedFilesCount = 0;

    if (fs.existsSync(this.logDir)) {
      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          try {
            fs.writeFileSync(filePath, '', 'utf8');
            clearedFilesCount++;
          } catch (_) {}
        }
      }
    }

    // Also purge any leftover DB rows to keep DB clean
    try {
      await this.prisma.system_logs.deleteMany();
    } catch (_) {}

    return {
      success: true,
      clearedFilesCount,
      message: `Successfully cleared Winston log files in ${this.logDir}`,
    };
  }
}

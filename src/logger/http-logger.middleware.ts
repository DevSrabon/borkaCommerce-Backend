import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'otp',
  'secret',
  'refreshtoken',
  'accesstoken',
  'card',
  'cvv',
  'authorization',
]);

function sanitizePayload(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitizePayload(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(private readonly loggerService: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime();
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'] as string;

    // Capture sanitized payload
    const payload = req.body && Object.keys(req.body).length > 0 ? sanitizePayload(req.body) : null;
    const query = req.url.includes('?') ? req.url.split('?')[1] : null;

    res.on('finish', () => {
      // Calculate high-resolution duration in ms
      const diff = process.hrtime(startTime);
      const durationMs = diff[0] * 1000 + diff[1] / 1e6;

      const route = originalUrl.split('?')[0];

      // Avoid recursion on log fetching itself
      if (route.startsWith('/admin/logs')) {
        return;
      }

      this.loggerService.recordHttpLog({
        method,
        route,
        statusCode: res.statusCode,
        durationMs,
        ip: (headers['x-forwarded-for'] as string) || ip || req.socket.remoteAddress,
        query: query ? decodeURIComponent(query) : undefined,
        payload,
        userAgent,
      });
    });

    next();
  }
}

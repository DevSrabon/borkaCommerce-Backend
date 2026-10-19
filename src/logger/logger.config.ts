import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const DailyRotateTransport: any =
  (DailyRotateFile as any).default || DailyRotateFile;

// 30 Days (1 Month) Retention Daily Rotating Files
const dailyHttpRotateTransport: any = new DailyRotateTransport({
  filename: path.join(logDir, 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // Retains logs for 30 days (1 month)
  level: 'info',
});

const dailyCombinedRotateTransport: any = new DailyRotateTransport({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // Retains logs for 30 days (1 month)
  level: 'info',
});

const dailyErrorRotateTransport: any = new DailyRotateTransport({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // Retains logs for 30 days (1 month)
  level: 'error',
});

// Transports: Save exclusively to Winston daily rotating files in /logs (terminal/PM2 console remains clean)
const transports: winston.transport[] = [
  dailyCombinedRotateTransport,
  dailyErrorRotateTransport,
  dailyHttpRotateTransport,
];

// Console transport is strictly limited to critical errors only when explicitly enabled
if (process.env.ENABLE_CONSOLE_LOGS === 'true') {
  transports.push(
    new winston.transports.Console({
      level: 'error',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] [${level}]: ${message}`;
        }),
      ),
    }),
  );
}

export const winstonLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports,
});

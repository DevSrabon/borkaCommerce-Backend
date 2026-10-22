import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { SiteSettingsService } from '../site-settings/site-settings.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private lastError: string | null = null;

  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  async onModuleInit() {
    await this.initClient();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async initClient() {
    const isEnabledStr = await this.siteSettingsService.getSetting('REDIS_ENABLED', 'false');
    const redisUrl = await this.siteSettingsService.getSetting('REDIS_URL', '');

    const isEnabled = isEnabledStr === 'true' || isEnabledStr === '1';

    await this.disconnect();

    if (!isEnabled || !redisUrl.trim()) {
      this.logger.log('Redis is DISABLED or URL is empty. Operating with direct database / in-memory storage.');
      this.client = null;
      this.isConnected = false;
      this.lastError = null;
      return;
    }

    try {
      const sanitized = redisUrl.replace(/\/\/[^@]+@/, '//***@');
      this.logger.log(`Connecting to dynamic Redis at: ${sanitized}`);

      this.client = new Redis(redisUrl.trim(), {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis retry limit exceeded. Pausing automatic reconnection.');
            return null; // Stop retrying
          }
          return Math.min(times * 1000, 3000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.lastError = null;
        this.logger.log('Redis connected successfully!');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.lastError = null;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.lastError = err.message;
        this.logger.warn(`Redis connection error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message;
      this.logger.error(`Failed to initialize Redis: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (_) {
        try {
          this.client.disconnect();
        } catch (_) {}
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  async getStatus() {
    const isEnabledStr = await this.siteSettingsService.getSetting('REDIS_ENABLED', 'false');
    const redisUrl = await this.siteSettingsService.getSetting('REDIS_URL', '');
    const isEnabled = isEnabledStr === 'true' || isEnabledStr === '1';

    let pingMs: number | null = null;
    let healthy = false;

    if (isEnabled && this.client && this.isConnected) {
      try {
        const start = Date.now();
        const res = await this.client.ping();
        if (res === 'PONG') {
          pingMs = Date.now() - start;
          healthy = true;
        }
      } catch (err: any) {
        healthy = false;
        this.lastError = err.message;
      }
    }

    return {
      enabled: isEnabled,
      hasUrl: Boolean(redisUrl.trim()),
      connected: this.isConnected,
      healthy,
      pingMs,
      lastError: this.lastError,
    };
  }

  async testConnection(testUrl?: string) {
    const url = testUrl?.trim() || (await this.siteSettingsService.getSetting('REDIS_URL', ''));
    if (!url) {
      return { success: false, message: 'Redis URL is required' };
    }

    let tempClient: Redis | null = null;
    try {
      tempClient = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });

      const start = Date.now();
      await tempClient.connect();
      const pong = await tempClient.ping();
      const pingMs = Date.now() - start;

      await tempClient.quit();

      if (pong === 'PONG') {
        return {
          success: true,
          message: `Successfully connected to Redis! PING response: ${pingMs}ms`,
          pingMs,
        };
      } else {
        return { success: false, message: `Unexpected response: ${pong}` };
      }
    } catch (err: any) {
      if (tempClient) {
        try {
          tempClient.disconnect();
        } catch (_) {}
      }
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  }

  // Safe cache operations
  async get(key: string): Promise<string | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch (_) {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (_) {}
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(key);
    } catch (_) {}
  }

  getClient(): Redis | null {
    return this.client;
  }

  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  async rpush(key: string, value: string): Promise<number | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      return await this.client.rpush(key, value);
    } catch (err: any) {
      this.logger.warn(`Redis rpush error on key ${key}: ${err.message}`);
      return null;
    }
  }

  async lpop(key: string): Promise<string | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      return await this.client.lpop(key);
    } catch (err: any) {
      this.logger.warn(`Redis lpop error on key ${key}: ${err.message}`);
      return null;
    }
  }

  async llen(key: string): Promise<number> {
    if (!this.isConnected || !this.client) return 0;
    try {
      return await this.client.llen(key);
    } catch (_) {
      return 0;
    }
  }
}


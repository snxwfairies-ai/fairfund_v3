import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: 3,
      retryStrategy: (t) => Math.min(t * 200, 3000),
      lazyConnect: false,
    });
    this.client.on('connect',      () => this.logger.log('✅ Redis connected'));
    this.client.on('error',        (e) => this.logger.error('Redis error', e.message));
    this.client.on('reconnecting', () => this.logger.warn('Redis reconnecting...'));
  }

  async onModuleDestroy() { await this.client?.quit(); }

  get(key: string)                          { return this.client.get(key); }
  set(key: string, value: string)           { return this.client.set(key, value); }
  setex(key: string, ttl: number, value: string) { return this.client.setex(key, ttl, value); }
  del(...keys: string[])                    { return this.client.del(...keys); }
  exists(...keys: string[])                 { return this.client.exists(...keys); }
  expire(key: string, ttl: number)          { return this.client.expire(key, ttl); }

  /** Cache-aside helper */
  async cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.client.get(key);
    if (hit) return JSON.parse(hit) as T;
    const data = await fn();
    await this.client.setex(key, ttl, JSON.stringify(data));
    return data;
  }

  /** Invalidate multiple cache keys by pattern prefix */
  async invalidatePattern(pattern: string) {
    const keys = await this.client.keys(pattern);
    if (keys.length) await this.client.del(...keys);
  }
}

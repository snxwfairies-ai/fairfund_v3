import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    this.pool.on('error', (err) => this.logger.error('Pool error', err.message));

    await this.waitForDB();
    this.logger.log('✅ PostgreSQL connected');
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private async waitForDB(retries = 10, delayMs = 3000) {
    for (let i = 1; i <= retries; i++) {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        return;
      } catch (err) {
        this.logger.warn(`PostgreSQL not ready (attempt ${i}/${retries})`);
        if (i === retries) throw err;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  /** Execute a parameterised query */
  async query<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const t0 = Date.now();
    try {
      const res = await this.pool.query<T>(text, params);
      const ms = Date.now() - t0;
      if (ms > 500) this.logger.warn(`Slow query (${ms}ms): ${text.slice(0, 80)}`);
      return res;
    } catch (err) {
      this.logger.error(`Query failed: ${text.slice(0, 120)}`, err.message);
      throw err;
    }
  }

  /** Convenience: return first row or undefined */
  async queryOne<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<T | undefined> {
    const res = await this.query<T>(text, params);
    return res.rows[0];
  }

  /** Convenience: return all rows */
  async queryMany<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<T[]> {
    const res = await this.query<T>(text, params);
    return res.rows;
  }

  /** Execute multiple queries in a single transaction */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

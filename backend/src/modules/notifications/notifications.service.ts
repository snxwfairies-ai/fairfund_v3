import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 }       from 'uuid';
import { DatabaseService }     from '../../database/database.service';
import { RedisService }        from '../../redis/redis.service';

export type NotifType = 'info' | 'success' | 'warning' | 'error' | 'action_required';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db:    DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /** Persist notification + publish to Redis for WebSocket delivery */
  async send(
    userId: string,
    type: NotifType,
    title: string,
    message: string,
    actionUrl?: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, action_url, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, userId, type, title, message, actionUrl ?? null, JSON.stringify(metadata ?? {})],
    );

    // Publish to Redis channel for WebSocket gateway to pick up
    const payload = JSON.stringify({ id, userId, type, title, message, actionUrl, createdAt: new Date().toISOString() });
    await this.redis.set(`notif:push:${userId}:${id}`, payload);
    // TTL 30 days — if socket offline, will be fetched on reconnect
    await this.redis.expire(`notif:push:${userId}:${id}`, 86400 * 30);

    // Publish for live delivery
    try {
      await (this.redis as any).client?.publish(`notif:${userId}`, payload);
    } catch { /* WebSocket pub is best-effort */ }

    this.logger.debug(`Notification → ${userId}: [${type}] ${title}`);
    return id;
  }

  async getUnread(userId: string) {
    return this.db.queryMany(
      `SELECT * FROM notifications WHERE user_id=$1 AND read=FALSE ORDER BY created_at DESC LIMIT 30`,
      [userId],
    );
  }

  async markAllRead(userId: string) {
    await this.db.query(
      `UPDATE notifications SET read=TRUE, read_at=NOW() WHERE user_id=$1 AND read=FALSE`,
      [userId],
    );
  }
}

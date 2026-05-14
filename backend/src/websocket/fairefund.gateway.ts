import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket }    from 'socket.io';
import { JwtService }        from '@nestjs/jwt';
import { ConfigService }     from '@nestjs/config';
import { RedisService }      from '../redis/redis.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class FaireFundGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(FaireFundGateway.name);

  // userId → socketId mapping (for targeted delivery)
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt:    JwtService,
    private readonly config: ConfigService,
    private readonly redis:  RedisService,
  ) {}

  // ── Authenticate on connect ────────────────────────────────────────────
  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token
        ?? socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) { socket.disconnect(); return; }

      const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
      socket.data.userId = payload.sub;
      socket.data.role   = payload.role;

      // Join personal room
      socket.join(`user:${payload.sub}`);

      // Track socket
      if (!this.userSockets.has(payload.sub)) this.userSockets.set(payload.sub, new Set());
      this.userSockets.get(payload.sub)!.add(socket.id);

      this.logger.log(`WS connected: ${payload.sub} [${socket.id}]`);
      socket.emit('connected', { message: 'FaireFund WebSocket connected', userId: payload.sub });
    } catch {
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      this.userSockets.get(userId)?.delete(socket.id);
      if (this.userSockets.get(userId)?.size === 0) this.userSockets.delete(userId);
    }
    this.logger.debug(`WS disconnected: ${socket.id}`);
  }

  // ── Emit to specific user (called by services) ─────────────────────────
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // ── Broadcast live deal update (e.g. investment progress) ──────────────
  emitDealUpdate(smeId: string, data: unknown) {
    this.server.emit('deal_update', { sme_id: smeId, ...data as object });
  }

  // ── Client: subscribe to specific SME deal room ────────────────────────
  @SubscribeMessage('subscribe_deal')
  handleSubscribeDeal(@MessageBody() body: { sme_id: string }, @ConnectedSocket() socket: Socket) {
    socket.join(`deal:${body.sme_id}`);
    this.logger.debug(`${socket.data.userId} subscribed to deal:${body.sme_id}`);
    return { ok: true, room: `deal:${body.sme_id}` };
  }

  // ── Client: fetch missed notifications ────────────────────────────────
  @SubscribeMessage('get_notifications')
  async handleGetNotifications(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.userId;
    if (!userId) return;
    // Push any queued notifications from Redis
    const keys = await (this.redis as any).client?.keys(`notif:push:${userId}:*`) ?? [];
    for (const key of keys.slice(0, 20)) {
      const val = await this.redis.get(key);
      if (val) socket.emit('notification', JSON.parse(val));
    }
  }
}

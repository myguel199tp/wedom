import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtPayload } from "src/auth/interfaces/jwt-payload.interface";
import { UserRole } from "src/auth/entities/user.entity";

export type WalletEventType =
  | "transfer.sent"
  | "transfer.received"
  | "transfer.held"
  | "transfer.approved"
  | "transfer.rejected";

export interface WalletEvent {
  type: WalletEventType;
  transaction?: unknown;
}

const userRoom = (userId: string) => `user:${userId}`;
// Sala compartida por todos los admins conectados: reciben las novedades de
// cumplimiento (transferencias retenidas / aprobadas / rechazadas) en vivo.
const ADMIN_ROOM = "admins";

const allowedOrigins = (
  process.env.CORS_ORIGINS ??
  process.env.FRONTEND_URL ??
  "http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: { origin: allowedOrigins, credentials: true },
})
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger("EventsGateway");

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>("JWT_SECRET"),
      });
      client.join(userRoom(payload.sub));
      if (payload.role === UserRole.ADMIN) client.join(ADMIN_ROOM);
      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  emitToUser(userId: string, event: WalletEvent) {
    this.server?.to(userRoom(userId)).emit("wallet:update", event);
  }

  /** Notifica a todos los admins conectados (panel de cumplimiento en vivo). */
  emitToAdmins(event: WalletEvent) {
    this.server?.to(ADMIN_ROOM).emit("wallet:update", event);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { DataSource, Repository } from "typeorm";
import { hash, compare } from "bcryptjs";
import { User, UserRole } from "./entities/user.entity";
import { Account } from "src/wallet/entities/account.entity";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import { BusinessException } from "src/common/errors/business.exception";
import { MailerService } from "src/mailer/mailer.service";
import { dollarsToCents } from "src/common/money";

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger("AuthService");

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new BusinessException("EMAIL_ALREADY_REGISTERED");
    }

    const passwordHash = await hash(dto.password, SALT_ROUNDS);
    const initialCents = dollarsToCents(
      Number(this.config.get("INITIAL_BALANCE_USD") ?? 0),
    );

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          password: passwordHash,
          role: UserRole.USER,
        }),
      );

      await manager.getRepository(Account).save(
        manager.getRepository(Account).create({
          userId: created.id,
          balanceCents: initialCents,
        }),
      );

      return created;
    });

    this.mailer
      .sendWelcome(user.email, user.fullName)
      .catch((e) =>
        this.logger.warn(`No se pudo enviar bienvenida: ${e.message}`),
      );

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      select: [
        "id",
        "email",
        "password",
        "role",
        "fullName",
        "failedLoginAttempts",
        "loginBlockedUntil",
      ],
    });

    if (!user) {
      throw new BusinessException("INVALID_CREDENTIALS");
    }

    if (user.loginBlockedUntil && user.loginBlockedUntil > new Date()) {
      throw new BusinessException("ACCOUNT_LOCKED");
    }

    const valid = await compare(dto.password, user.password);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.loginBlockedUntil = new Date(Date.now() + BLOCK_MINUTES * 60_000);
      }
      await this.userRepo.save(user);
      throw new BusinessException("INVALID_CREDENTIALS");
    }

    user.failedLoginAttempts = 0;
    user.loginBlockedUntil = null;
    await this.userRepo.save(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async requestPasswordRecovery(email: string) {
    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      // El token se firma con un secreto derivado del hash actual de la
      // contraseña: así queda invalidado automáticamente en cuanto la clave
      // cambia (un solo uso efectivo, sin necesidad de persistir estado).
      const token = this.jwtService.sign(
        { sub: user.id, email: user.email, type: "password-reset" },
        { expiresIn: "1h", secret: this.resetTokenSecret(user.password) },
      );
      const frontendUrl =
        this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3001";
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

      this.mailer
        .sendPasswordRecovery(user.email, user.fullName, resetUrl)
        .catch((e) =>
          this.logger.warn(`No se pudo enviar recuperación: ${e.message}`),
        );
    }

    return {
      success: true,
      message: "Si el correo está registrado, recibirás instrucciones.",
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Decodificamos sin verificar solo para saber a qué usuario apunta el token.
    // La verificación real (firma + expiración) se hace luego con el secreto
    // derivado del hash de contraseña vigente de ese usuario.
    const claim = this.jwtService.decode(token) as {
      sub?: string;
      type?: string;
    } | null;

    if (!claim?.sub || claim.type !== "password-reset") {
      throw new BusinessException(
        "UNAUTHENTICATED",
        undefined,
        "Token inválido o expirado.",
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: claim.sub },
      select: ["id", "email", "fullName", "password"],
    });
    if (!user) {
      throw new BusinessException("ACCOUNT_NOT_FOUND");
    }

    try {
      this.jwtService.verify(token, {
        secret: this.resetTokenSecret(user.password),
      });
    } catch {
      throw new BusinessException(
        "UNAUTHENTICATED",
        undefined,
        "Token inválido o expirado.",
      );
    }

    user.password = await hash(newPassword, SALT_ROUNDS);
    user.failedLoginAttempts = 0;
    user.loginBlockedUntil = null;
    await this.userRepo.save(user);

    this.mailer
      .sendPasswordChanged(user.email, user.fullName)
      .catch((e) =>
        this.logger.warn(`No se pudo enviar aviso de cambio: ${e.message}`),
      );

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BusinessException("ACCOUNT_NOT_FOUND");
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  /**
   * Secreto para firmar/verificar tokens de recuperación de contraseña.
   * Combina el JWT_SECRET del servicio con el hash de contraseña vigente del
   * usuario, de modo que cualquier token emitido deja de ser válido en cuanto
   * la contraseña cambia (uso único efectivo, sin estado persistido).
   */
  private resetTokenSecret(passwordHash: string): string {
    const base = this.config.get<string>("JWT_SECRET") ?? "";
    return `${base}:${passwordHash}`;
  }
}

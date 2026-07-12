import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TransactionStatus } from "src/wallet/entities/transaction.entity";
import { User } from "src/auth/entities/user.entity";
import { centsToDollars, dollarsToCents } from "src/common/money";
import { BusinessException } from "src/common/errors/business.exception";
import { AuditQueryDto } from "./dto/audit-query.dto";
import { AdminRepository } from "./admin.repository";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly adminRepo: AdminRepository,
  ) {}

  async listUsers(page = 1, limit = 20) {
    const [rows, total] = await this.userRepo.findAndCount({
      select: ["id", "fullName", "email", "role", "createdAt"],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async userTransactions(userId: string, page = 1, limit = 20) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ["id", "fullName", "email", "role", "createdAt"],
    });
    if (!user) throw new BusinessException("USER_NOT_FOUND");

    const [rows, total] = await this.adminRepo.findUserTransactions(
      userId,
      page,
      limit,
    );

    return {
      user,
      data: rows.map((t) => {
        const isSender = t.senderAccount?.user?.id === userId;
        return {
          id: t.id,
          amount: centsToDollars(t.amountCents),
          currency: t.currency,
          status: t.status,
          direction: isSender ? "SENT" : "RECEIVED",
          counterpartyEmail: isSender
            ? t.receiverAccount?.user?.email
            : t.senderAccount?.user?.email,
          description: t.description ?? undefined,
          reviewReason: t.reviewReason ?? undefined,
          rejectionReason: t.rejectionReason ?? undefined,
          createdAt: t.createdAt,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async suspicious(page = 1, limit = 20) {
    const thresholdCents = dollarsToCents(
      Number(this.config.get("COMPLIANCE_THRESHOLD_USD") ?? 1000),
    );
    // Monto "muy superior": por encima de este segundo umbral se marca aparte.
    const veryLargeCents = dollarsToCents(
      Number(this.config.get("SUSPICIOUS_VERY_LARGE_AMOUNT_USD") ?? 3000),
    );
    const velocityMax = Number(this.config.get("VELOCITY_MAX_TRANSFERS") ?? 5);
    const windowSeconds = Number(
      this.config.get("VELOCITY_WINDOW_SECONDS") ?? 60,
    );
    // Fragmentación (structuring): N o más envíos por debajo del umbral cuya
    // suma supera el umbral, dentro de la ventana => reparto para evadir control.
    const structuringMinCount = Number(
      this.config.get("SUSPICIOUS_STRUCTURING_MIN_COUNT") ?? 3,
    );
    const structuringWindowSeconds = Number(
      this.config.get("SUSPICIOUS_STRUCTURING_WINDOW_SECONDS") ?? 3600,
    );
    // Horario inusual: transferencias iniciadas muy de noche o muy de mañana.
    // Se evalúa la hora local en la zona horaria de negocio.
    const oddHoursStart = Number(
      this.config.get("SUSPICIOUS_ODD_HOURS_START") ?? 0,
    );
    const oddHoursEnd = Number(this.config.get("SUSPICIOUS_ODD_HOURS_END") ?? 5);
    const timezone =
      this.config.get<string>("SUSPICIOUS_TIMEZONE") ?? "America/Bogota";

    const rows = await this.adminRepo.findTransactionsWithSenderVelocity(
      windowSeconds,
      thresholdCents,
      structuringWindowSeconds,
    );

    const flagged = rows
      .map((r) => {
        const amountCents = parseInt(r.amountCents, 10);
        const senderRecentCount = parseInt(r.senderRecentCount, 10);
        const senderSmallCount = parseInt(r.senderSmallCount, 10);
        const senderSmallSum = parseInt(r.senderSmallSum, 10);
        const reasons: string[] = [];

        if (amountCents > thresholdCents) reasons.push("LARGE_AMOUNT");
        if (amountCents > veryLargeCents) reasons.push("VERY_LARGE_AMOUNT");
        if (senderRecentCount > velocityMax) reasons.push("HIGH_VELOCITY");
        // Structuring: esta transferencia es pequeña (< umbral) pero forma parte
        // de un patrón de muchas pequeñas que en conjunto superan el umbral.
        if (
          amountCents < thresholdCents &&
          senderSmallCount >= structuringMinCount &&
          senderSmallSum > thresholdCents
        )
          reasons.push("STRUCTURING");
        if (this.isOddHour(r.createdAt, timezone, oddHoursStart, oddHoursEnd))
          reasons.push("ODD_HOURS");
        if (r.status === TransactionStatus.REJECTED)
          reasons.push("REJECTED_BY_COMPLIANCE");

        return {
          id: r.id,
          amount: centsToDollars(amountCents),
          currency: r.currency,
          status: r.status,
          senderEmail: r.senderEmail,
          receiverEmail: r.receiverEmail,
          createdAt: r.createdAt,
          reasons,
          senderRecentCount,
        };
      })
      .filter((r) => r.reasons.length > 0);

    const total = flagged.length;
    const start = (page - 1) * limit;

    return {
      criteria: {
        largeAmountAboveUsd: centsToDollars(thresholdCents),
        veryLargeAmountAboveUsd: centsToDollars(veryLargeCents),
        highVelocityMoreThan: velocityMax,
        velocityWindowSeconds: windowSeconds,
        structuringMinCount,
        structuringWindowSeconds,
        oddHoursFrom: oddHoursStart,
        oddHoursTo: oddHoursEnd,
        timezone,
      },
      data: flagged.slice(start, start + limit),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * ¿La hora local (en `timezone`) de `date` cae en la franja horaria inusual
   * [start, end)? Soporta franjas que cruzan medianoche (p. ej. 22 → 5).
   */
  private isOddHour(
    date: Date,
    timezone: string,
    start: number,
    end: number,
  ): boolean {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(new Date(date)),
    ) % 24;

    // Franja normal (no cruza medianoche): start <= hour < end.
    if (start <= end) return hour >= start && hour < end;
    // Franja que cruza medianoche (p. ej. 22 → 5): hour >= start OR hour < end.
    return hour >= start || hour < end;
  }

  async auditLedger(query: AuditQueryDto) {
    const { page, limit } = query;

    const [rows, total] = await this.adminRepo.findLedgerEntries(query);

    return {
      data: rows.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        accountId: entry.accountId,
        accountOwner: entry.account?.user?.email,
        direction: entry.direction,
        amount: centsToDollars(entry.amountCents),
        balanceAfter: centsToDollars(entry.balanceAfterCents),
        memo: entry.memo ?? undefined,
        createdAt: entry.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reconciliation() {
    const [ledger, pending, balance] = await Promise.all([
      this.adminRepo.sumLedgerByDirection(),
      this.adminRepo.sumPendingTransactions(),
      this.adminRepo.sumAccountBalances(),
    ]);

    const totalDebitsCents = parseInt(ledger.debits, 10);
    const totalCreditsCents = parseInt(ledger.credits, 10);
    const netHeldCents = totalDebitsCents - totalCreditsCents;
    const totalPendingCents = parseInt(pending, 10);

    return {
      balanced: netHeldCents === totalPendingCents,
      totalDebits: centsToDollars(totalDebitsCents),
      totalCredits: centsToDollars(totalCreditsCents),
      netHeld: centsToDollars(netHeldCents),
      totalPendingReview: centsToDollars(totalPendingCents),
      totalAvailableBalance: centsToDollars(parseInt(balance, 10)),
    };
  }
}

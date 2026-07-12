import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Account } from "./entities/account.entity";
import {
  ReviewReason,
  Transaction,
  TransactionStatus,
} from "./entities/transaction.entity";
import { LedgerDirection, LedgerEntry } from "./entities/ledger-entry.entity";
import { TransferChallenge } from "./entities/transfer-challenge.entity";
import { User } from "src/auth/entities/user.entity";
import { TransferDto } from "./dto/transfer.dto";
import { BusinessException } from "src/common/errors/business.exception";
import { centsToDollars, dollarsToCents } from "src/common/money";
import { MailerService } from "src/mailer/mailer.service";
import { EventsGateway } from "src/events/events.gateway";
import { hash, compare } from "bcryptjs";
import { randomInt } from "crypto";

interface TransferParams {
  recipientEmail: string;
  amount: number;
  description?: string;
  reference?: string;
}

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class WalletService {
  private readonly logger = new Logger("WalletService");

  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(TransferChallenge)
    private readonly challengeRepo: Repository<TransferChallenge>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly events: EventsGateway,
  ) {}

  private async userIdOfAccount(accountId: string): Promise<string | null> {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });
    return account?.userId ?? null;
  }

  private get thresholdCents(): number {
    return dollarsToCents(
      Number(this.config.get("COMPLIANCE_THRESHOLD_USD") ?? 1000),
    );
  }

  async getBalance(userId: string) {
    const account = await this.accountRepo.findOne({ where: { userId } });
    if (!account) throw new BusinessException("ACCOUNT_NOT_FOUND");

    // Solo exponemos el saliente retenido (dinero que el propio usuario envió y
    // está en revisión). No exponemos "entrante en revisión": el receptor no
    // debe enterarse de dinero que aún no le pertenece y podría ser rechazado.
    const pendingOutgoing = await this.sumPending(
      account.id,
      "senderAccountId",
    );

    return {
      accountId: account.id,
      currency: account.currency,
      availableBalance: centsToDollars(account.balanceCents),
      pendingOutgoing: centsToDollars(pendingOutgoing),
    };
  }

  private async sumPending(
    accountId: string,
    column: "senderAccountId" | "receiverAccountId",
  ): Promise<number> {
    const { sum } = await this.txRepo
      .createQueryBuilder("t")
      .select("COALESCE(SUM(t.amountCents), 0)", "sum")
      .where(`t.${column} = :accountId`, { accountId })
      .andWhere("t.status = :status", {
        status: TransactionStatus.PENDING_REVIEW,
      })
      .getRawOne<{ sum: string }>();
    return parseInt(sum ?? "0", 10);
  }

  async transfer(userId: string, dto: TransferDto) {
    const amountCents = dollarsToCents(dto.amount);
    if (amountCents <= 0) throw new BusinessException("INVALID_AMOUNT");

    if (amountCents <= this.thresholdCents) {
      return this.performTransfer(userId, dto);
    }
    return this.createOtpChallenge(userId, dto, amountCents);
  }

  private async createOtpChallenge(
    userId: string,
    dto: TransferDto,
    amountCents: number,
  ) {
    const sender = await this.accountRepo.findOne({ where: { userId } });
    if (!sender) throw new BusinessException("ACCOUNT_NOT_FOUND");

    const receiverUser = await this.dataSource.getRepository(User).findOne({
      where: { email: dto.recipientEmail.toLowerCase() },
    });
    if (!receiverUser) throw new BusinessException("RECIPIENT_NOT_FOUND");

    const receiver = await this.accountRepo.findOne({
      where: { userId: receiverUser.id },
    });
    if (!receiver) throw new BusinessException("RECIPIENT_NOT_FOUND");
    if (receiver.id === sender.id)
      throw new BusinessException("CANNOT_TRANSFER_TO_SELF");

    if (sender.balanceCents < amountCents) {
      throw new BusinessException("INSUFFICIENT_FUNDS", {
        availableBalance: centsToDollars(sender.balanceCents),
        requested: dto.amount,
      });
    }

    const code = String(randomInt(100000, 1000000)); // 6 dígitos
    const senderUser = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });

    const challenge = await this.challengeRepo.save(
      this.challengeRepo.create({
        senderAccountId: sender.id,
        recipientEmail: dto.recipientEmail.toLowerCase(),
        amountCents,
        currency: sender.currency,
        description: dto.description ?? null,
        reference: dto.reference ?? null,
        codeHash: await hash(code, 10),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000),
      }),
    );

    await this.mailer.sendTransferOtp(
      senderUser?.email ?? "",
      senderUser?.fullName ?? "usuario",
      code,
      dto.amount,
    );

    return {
      requiresOtp: true,
      challengeId: challenge.id,
      amount: dto.amount,
      expiresAt: challenge.expiresAt,
      message:
        "Transferencia > umbral: te enviamos un código por correo para confirmar.",
      ...(process.env.NODE_ENV !== "production" ? { debugCode: code } : {}),
    };
  }

  async confirmTransfer(userId: string, challengeId: string, code: string) {
    const sender = await this.accountRepo.findOne({ where: { userId } });
    if (!sender) throw new BusinessException("ACCOUNT_NOT_FOUND");

    const challenge = await this.challengeRepo.findOne({
      where: { id: challengeId, senderAccountId: sender.id },
    });
    if (!challenge || challenge.consumedAt) {
      throw new BusinessException("OTP_CHALLENGE_NOT_FOUND");
    }
    if (challenge.expiresAt < new Date()) {
      throw new BusinessException("OTP_EXPIRED");
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BusinessException("OTP_MAX_ATTEMPTS");
    }

    const valid = await compare(code, challenge.codeHash);
    if (!valid) {
      challenge.attempts += 1;
      await this.challengeRepo.save(challenge);
      throw new BusinessException("OTP_INVALID", {
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts),
      });
    }

    challenge.consumedAt = new Date();
    await this.challengeRepo.save(challenge);

    return this.performTransfer(userId, {
      recipientEmail: challenge.recipientEmail,
      amount: centsToDollars(challenge.amountCents),
      description: challenge.description ?? undefined,
      reference: challenge.reference ?? undefined,
    });
  }

  private async performTransfer(userId: string, dto: TransferParams) {
    const amountCents = dollarsToCents(dto.amount);
    if (amountCents <= 0) throw new BusinessException("INVALID_AMOUNT");

    if (dto.reference) {
      const existing = await this.txRepo.findOne({
        where: { reference: dto.reference },
      });
      if (existing) return this.mapTransaction(existing);
    }

    try {
      const outcome = await this.dataSource.transaction(async (manager) => {
        const accountRepo = manager.getRepository(Account);

        const senderPre = await accountRepo.findOne({ where: { userId } });
        if (!senderPre) throw new BusinessException("ACCOUNT_NOT_FOUND");

        const receiverUser = await manager.getRepository(User).findOne({
          where: { email: dto.recipientEmail.toLowerCase() },
        });
        if (!receiverUser) throw new BusinessException("RECIPIENT_NOT_FOUND");

        const receiverPre = await accountRepo.findOne({
          where: { userId: receiverUser.id },
        });
        if (!receiverPre) throw new BusinessException("RECIPIENT_NOT_FOUND");

        if (senderPre.id === receiverPre.id) {
          throw new BusinessException("CANNOT_TRANSFER_TO_SELF");
        }

        const ids = [senderPre.id, receiverPre.id].sort();
        await manager.query(
          `SELECT id FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
          [ids],
        );

        const sender = await accountRepo.findOneOrFail({
          where: { id: senderPre.id },
        });
        const receiver = await accountRepo.findOneOrFail({
          where: { id: receiverPre.id },
        });
        const senderUser = await manager
          .getRepository(User)
          .findOne({ where: { id: userId } });

        if (sender.balanceCents < amountCents) {
          throw new BusinessException("INSUFFICIENT_FUNDS", {
            availableBalance: centsToDollars(sender.balanceCents),
            requested: dto.amount,
          });
        }

        const needsReview = amountCents > this.thresholdCents;

        sender.balanceCents -= amountCents;
        await accountRepo.save(sender);

        const tx = await manager.getRepository(Transaction).save(
          manager.getRepository(Transaction).create({
            reference: dto.reference ?? null,
            senderAccountId: sender.id,
            receiverAccountId: receiver.id,
            amountCents,
            currency: sender.currency,
            description: dto.description ?? null,
            status: needsReview
              ? TransactionStatus.PENDING_REVIEW
              : TransactionStatus.COMPLETED,
            reviewReason: needsReview
              ? ReviewReason.AMOUNT_ABOVE_THRESHOLD
              : null,
          }),
        );

        await this.writeLedger(
          manager,
          tx.id,
          sender.id,
          LedgerDirection.DEBIT,
          amountCents,
          sender.balanceCents,
          "Transferencia enviada",
        );

        if (!needsReview) {
          receiver.balanceCents += amountCents;
          await accountRepo.save(receiver);
          await this.writeLedger(
            manager,
            tx.id,
            receiver.id,
            LedgerDirection.CREDIT,
            amountCents,
            receiver.balanceCents,
            "Transferencia recibida",
          );
        }

        return {
          tx,
          needsReview,
          senderUserId: userId,
          receiverUserId: receiverUser.id,
          receiverEmail: receiverUser.email,
          receiverName: receiverUser.fullName,
          senderName: senderUser?.fullName ?? "un usuario",
        };
      });

      // Al receptor solo se le avisa cuando el dinero realmente entró. Si la
      // transferencia queda en revisión, no se le notifica: aún no le pertenece
      // y podría ser rechazada.
      if (!outcome.needsReview) {
        await this.mailer.sendTransferReceived(
          outcome.receiverEmail,
          outcome.receiverName,
          dto.amount,
          outcome.senderName,
        );
      }

      const mapped = this.mapTransaction(outcome.tx);
      this.events.emitToUser(outcome.senderUserId, {
        type: outcome.needsReview ? "transfer.held" : "transfer.sent",
        transaction: mapped,
      });
      if (outcome.needsReview) {
        // Nueva transferencia retenida: avisar a los admins para que su panel
        // de cumplimiento la muestre sin recargar.
        this.events.emitToAdmins({ type: "transfer.held", transaction: mapped });
      } else {
        this.events.emitToUser(outcome.receiverUserId, {
          type: "transfer.received",
          transaction: mapped,
        });
      }

      return mapped;
    } catch (err: any) {
      const pgCode = err?.code ?? err?.driverError?.code;
      if (pgCode === "23505" && dto.reference) {
        const existing = await this.txRepo.findOne({
          where: { reference: dto.reference },
        });
        if (existing) return this.mapTransaction(existing);
        throw new BusinessException("DUPLICATE_TRANSFER");
      }
      throw err;
    }
  }

  async approveTransfer(adminId: string, txId: string) {
    const tx = await this.dataSource.transaction(async (manager) => {
      const transaction = await this.loadReviewable(manager, txId);
      const accountRepo = manager.getRepository(Account);

      await manager.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [
        transaction.receiverAccountId,
      ]);
      const receiver = await accountRepo.findOneOrFail({
        where: { id: transaction.receiverAccountId },
      });

      receiver.balanceCents += transaction.amountCents;
      await accountRepo.save(receiver);
      await this.writeLedger(
        manager,
        transaction.id,
        receiver.id,
        LedgerDirection.CREDIT,
        transaction.amountCents,
        receiver.balanceCents,
        "Transferencia recibida (aprobada por cumplimiento)",
      );

      transaction.status = TransactionStatus.COMPLETED;
      transaction.reviewedBy = adminId;
      transaction.reviewedAt = new Date();
      return manager.getRepository(Transaction).save(transaction);
    });

    const mapped = this.mapTransaction(tx);
    await this.emitToAccounts(tx.senderAccountId, tx.receiverAccountId, {
      type: "transfer.approved",
      transaction: mapped,
    });
    this.events.emitToAdmins({ type: "transfer.approved", transaction: mapped });
    return mapped;
  }

  async rejectTransfer(adminId: string, txId: string, reason?: string) {
    const tx = await this.dataSource.transaction(async (manager) => {
      const transaction = await this.loadReviewable(manager, txId);
      const accountRepo = manager.getRepository(Account);

      await manager.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [
        transaction.senderAccountId,
      ]);
      const sender = await accountRepo.findOneOrFail({
        where: { id: transaction.senderAccountId },
      });

      sender.balanceCents += transaction.amountCents;
      await accountRepo.save(sender);
      await this.writeLedger(
        manager,
        transaction.id,
        sender.id,
        LedgerDirection.CREDIT,
        transaction.amountCents,
        sender.balanceCents,
        "Reverso: transferencia rechazada por cumplimiento",
      );

      transaction.status = TransactionStatus.REJECTED;
      transaction.reviewedBy = adminId;
      transaction.reviewedAt = new Date();
      transaction.rejectionReason = reason ?? "Rechazada por cumplimiento";
      return manager.getRepository(Transaction).save(transaction);
    });

    // Un rechazo solo concierne al emisor (se le reversó su dinero). El receptor
    // nunca vio esta transferencia, así que no se le notifica.
    const mapped = this.mapTransaction(tx);
    const senderUserId = await this.userIdOfAccount(tx.senderAccountId);
    if (senderUserId) {
      this.events.emitToUser(senderUserId, {
        type: "transfer.rejected",
        transaction: mapped,
      });
    }
    this.events.emitToAdmins({ type: "transfer.rejected", transaction: mapped });
    return mapped;
  }

  private async emitToAccounts(
    senderAccountId: string,
    receiverAccountId: string,
    event: Parameters<EventsGateway["emitToUser"]>[1],
  ) {
    const [senderUserId, receiverUserId] = await Promise.all([
      this.userIdOfAccount(senderAccountId),
      this.userIdOfAccount(receiverAccountId),
    ]);
    if (senderUserId) this.events.emitToUser(senderUserId, event);
    if (receiverUserId) this.events.emitToUser(receiverUserId, event);
  }

  private async loadReviewable(
    manager: EntityManager,
    txId: string,
  ): Promise<Transaction> {
    const tx = await manager
      .getRepository(Transaction)
      .findOne({ where: { id: txId } });
    if (!tx) throw new BusinessException("TRANSACTION_NOT_FOUND");
    if (tx.status !== TransactionStatus.PENDING_REVIEW) {
      throw new BusinessException("TRANSACTION_NOT_IN_REVIEW");
    }
    return tx;
  }

  async history(userId: string, page: number, limit: number) {
    const account = await this.accountRepo.findOne({ where: { userId } });
    if (!account) throw new BusinessException("ACCOUNT_NOT_FOUND");

    // El emisor ve todas sus transacciones (incluidas en revisión y rechazadas).
    // El receptor solo ve las COMPLETADAS: mientras una transferencia está en
    // revisión o si es rechazada, el dinero nunca entró a su cuenta, así que no
    // debe aparecer en sus movimientos.
    const [rows, total] = await this.txRepo.findAndCount({
      where: [
        { senderAccountId: account.id },
        {
          receiverAccountId: account.id,
          status: TransactionStatus.COMPLETED,
        },
      ],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map((t) => this.mapTransaction(t, account.id)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async writeLedger(
    manager: EntityManager,
    transactionId: string,
    accountId: string,
    direction: LedgerDirection,
    amountCents: number,
    balanceAfterCents: number,
    memo: string,
  ) {
    const repo = manager.getRepository(LedgerEntry);
    await repo.save(
      repo.create({
        transactionId,
        accountId,
        direction,
        amountCents,
        balanceAfterCents,
        memo,
      }),
    );
  }

  private mapTransaction(tx: Transaction, viewerAccountId?: string) {
    return {
      id: tx.id,
      reference: tx.reference ?? undefined,
      amount: centsToDollars(tx.amountCents),
      currency: tx.currency,
      status: tx.status,
      reviewReason: tx.reviewReason ?? undefined,
      description: tx.description ?? undefined,
      direction: viewerAccountId
        ? tx.senderAccountId === viewerAccountId
          ? "SENT"
          : "RECEIVED"
        : undefined,
      senderAccountId: tx.senderAccountId,
      receiverAccountId: tx.receiverAccountId,
      rejectionReason: tx.rejectionReason ?? undefined,
      createdAt: tx.createdAt,
    };
  }
}

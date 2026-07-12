import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Transaction,
  TransactionStatus,
} from "src/wallet/entities/transaction.entity";
import {
  LedgerDirection,
  LedgerEntry,
} from "src/wallet/entities/ledger-entry.entity";
import { Account } from "src/wallet/entities/account.entity";

/** Fila cruda devuelta por {@link AdminRepository.findTransactionsWithSenderVelocity}. */
export interface TransactionWithSenderVelocityRow {
  id: string;
  amountCents: string;
  currency: string;
  status: TransactionStatus;
  senderEmail: string;
  receiverEmail: string;
  createdAt: Date;
  senderRecentCount: string;
  /** Transferencias del emisor por debajo del umbral dentro de la ventana de fragmentación. */
  senderSmallCount: string;
  /** Suma (en centavos) de esas transferencias por debajo del umbral. */
  senderSmallSum: string;
}

/** Filtros opcionales para {@link AdminRepository.findLedgerEntries}. */
export interface LedgerEntryFilters {
  page: number;
  limit: number;
  accountId?: string;
  transactionId?: string;
}

/** Sumas agregadas del libro mayor (en centavos, como texto de Postgres). */
export interface LedgerSums {
  debits: string;
  credits: string;
}

@Injectable()
export class AdminRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  /**
   * Devuelve todas las transacciones junto con el email de remitente y
   * destinatario y, contando hacia atrás desde cada transacción:
   * - `senderRecentCount`: cuántas transacciones emitió el remitente dentro de
   *   la ventana de velocidad (`velocityWindowSeconds`).
   * - `senderSmallCount` / `senderSmallSum`: cuántas transferencias por debajo
   *   del umbral (`thresholdCents`) emitió el remitente y su suma, dentro de la
   *   ventana de fragmentación (`structuringWindowSeconds`) — señal de
   *   *structuring* (dividir una suma grande en muchas pequeñas).
   * El filtrado/marcado de sospechosas se hace en el servicio.
   */
  findTransactionsWithSenderVelocity(
    velocityWindowSeconds: number,
    thresholdCents: number,
    structuringWindowSeconds: number,
  ): Promise<TransactionWithSenderVelocityRow[]> {
    return this.txRepo.query(
      `
      SELECT
        t.id,
        t."amountCents"          AS "amountCents",
        t.currency               AS currency,
        t.status                 AS status,
        su.email                 AS "senderEmail",
        ru.email                 AS "receiverEmail",
        t.created_at             AS "createdAt",
        (
          SELECT COUNT(*)::int FROM transactions t2
          WHERE t2."senderAccountId" = t."senderAccountId"
            AND t2.created_at <= t.created_at
            AND t2.created_at > t.created_at - ($1 * INTERVAL '1 second')
        )                        AS "senderRecentCount",
        (
          SELECT COUNT(*)::int FROM transactions t3
          WHERE t3."senderAccountId" = t."senderAccountId"
            AND t3."amountCents" < $2
            AND t3.created_at <= t.created_at
            AND t3.created_at > t.created_at - ($3 * INTERVAL '1 second')
        )                        AS "senderSmallCount",
        (
          SELECT COALESCE(SUM(t3."amountCents"), 0)::bigint FROM transactions t3
          WHERE t3."senderAccountId" = t."senderAccountId"
            AND t3."amountCents" < $2
            AND t3.created_at <= t.created_at
            AND t3.created_at > t.created_at - ($3 * INTERVAL '1 second')
        )                        AS "senderSmallSum"
      FROM transactions t
      JOIN accounts sa ON sa.id = t."senderAccountId"
      JOIN users su    ON su.id = sa."userId"
      JOIN accounts ra ON ra.id = t."receiverAccountId"
      JOIN users ru    ON ru.id = ra."userId"
      ORDER BY t.created_at DESC
      `,
      [velocityWindowSeconds, thresholdCents, structuringWindowSeconds],
    );
  }

  /**
   * Entradas del libro mayor (partida doble) paginadas, con la cuenta y su
   * usuario precargados, y filtros opcionales por cuenta o transacción.
   * Devuelve `[filas, total]`.
   */
  findLedgerEntries(
    filters: LedgerEntryFilters,
  ): Promise<[LedgerEntry[], number]> {
    const { page, limit, accountId, transactionId } = filters;

    const qb = this.ledgerRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.account", "acc")
      .leftJoinAndSelect("acc.user", "usr")
      .orderBy("l.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (accountId) qb.andWhere("l.accountId = :accountId", { accountId });
    if (transactionId)
      qb.andWhere("l.transactionId = :transactionId", { transactionId });

    return qb.getManyAndCount();
  }

  /**
   * Transacciones en las que participa un usuario (como emisor o receptor),
   * paginadas y con ambas cuentas y sus usuarios precargados para resolver el
   * email de la contraparte. Incluye todos los estados (para auditoría).
   * Devuelve `[filas, total]`.
   */
  findUserTransactions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<[Transaction[], number]> {
    return this.txRepo
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.senderAccount", "sa")
      .leftJoinAndSelect("sa.user", "su")
      .leftJoinAndSelect("t.receiverAccount", "ra")
      .leftJoinAndSelect("ra.user", "ru")
      .where("su.id = :userId OR ru.id = :userId", { userId })
      .orderBy("t.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  /** Σ débitos y Σ créditos del libro mayor completo (en centavos). */
  async sumLedgerByDirection(): Promise<LedgerSums> {
    const sums = await this.ledgerRepo
      .createQueryBuilder("l")
      .select(
        `COALESCE(SUM(CASE WHEN l.direction = :debit THEN l."amountCents" ELSE 0 END), 0)`,
        "debits",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN l.direction = :credit THEN l."amountCents" ELSE 0 END), 0)`,
        "credits",
      )
      .setParameters({
        debit: LedgerDirection.DEBIT,
        credit: LedgerDirection.CREDIT,
      })
      .getRawOne<LedgerSums>();

    return sums ?? { debits: "0", credits: "0" };
  }

  /** Σ montos de transacciones retenidas (PENDING_REVIEW), en centavos. */
  async sumPendingTransactions(): Promise<string> {
    const row = await this.txRepo
      .createQueryBuilder("t")
      .select(`COALESCE(SUM(t."amountCents"), 0)`, "pending")
      .where("t.status = :status", {
        status: TransactionStatus.PENDING_REVIEW,
      })
      .getRawOne<{ pending: string }>();

    return row?.pending ?? "0";
  }

  /** Σ saldos disponibles de todas las cuentas, en centavos. */
  async sumAccountBalances(): Promise<string> {
    const row = await this.accountRepo
      .createQueryBuilder("a")
      .select(`COALESCE(SUM(a."balanceCents"), 0)`, "balance")
      .getRawOne<{ balance: string }>();

    return row?.balance ?? "0";
  }
}

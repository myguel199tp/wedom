import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Account } from "./account.entity";
import { Transaction } from "./transaction.entity";
import { bigintToCents } from "src/common/money";

export enum LedgerDirection {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

@Entity("ledger_entries")
@Index(["accountId", "createdAt"])
export class LedgerEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Transaction, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "transactionId" })
  transaction: Transaction;

  @Column({ type: "uuid" })
  transactionId: string;

  @ManyToOne(() => Account, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "accountId" })
  account: Account;

  @Column({ type: "uuid" })
  accountId: string;

  @Column({ type: "enum", enum: LedgerDirection })
  direction: LedgerDirection;

  @Column({ type: "bigint", transformer: bigintToCents })
  amountCents: number;

  /** Saldo disponible de la cuenta justo después de aplicar este movimiento. */
  @Column({ type: "bigint", transformer: bigintToCents })
  balanceAfterCents: number;

  @Column({ type: "text", nullable: true })
  memo?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}

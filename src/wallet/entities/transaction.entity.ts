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
import { bigintToCents } from "src/common/money";

export enum TransactionStatus {
  COMPLETED = "COMPLETED",
  PENDING_REVIEW = "PENDING_REVIEW",
  REJECTED = "REJECTED",
}

export enum ReviewReason {
  AMOUNT_ABOVE_THRESHOLD = "AMOUNT_ABOVE_THRESHOLD",
}

@Entity("transactions")
@Index(["senderAccountId", "createdAt"])
@Index(["status"])
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", nullable: true, unique: true })
  reference?: string | null;

  @ManyToOne(() => Account, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "senderAccountId" })
  senderAccount: Account;

  @Column({ type: "uuid" })
  senderAccountId: string;

  @ManyToOne(() => Account, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "receiverAccountId" })
  receiverAccount: Account;

  @Column({ type: "uuid" })
  receiverAccountId: string;

  @Column({ type: "bigint", transformer: bigintToCents })
  amountCents: number;

  @Column({ default: "USD" })
  currency: string;

  @Column({ type: "enum", enum: TransactionStatus })
  status: TransactionStatus;

  @Column({ type: "enum", enum: ReviewReason, nullable: true })
  reviewReason?: ReviewReason | null;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "uuid", nullable: true })
  reviewedBy?: string | null;

  @Column({ type: "timestamp", nullable: true })
  reviewedAt?: Date | null;

  @Column({ type: "text", nullable: true })
  rejectionReason?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}

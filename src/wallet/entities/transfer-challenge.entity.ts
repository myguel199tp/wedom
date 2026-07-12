import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { bigintToCents } from "src/common/money";

@Entity("transfer_challenges")
@Index(["senderAccountId", "consumedAt"])
export class TransferChallenge {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  senderAccountId: string;

  @Column()
  recipientEmail: string;

  @Column({ type: "bigint", transformer: bigintToCents })
  amountCents: number;

  @Column({ default: "USD" })
  currency: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "varchar", nullable: true })
  reference?: string | null;

  @Column()
  codeHash: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @Column({ type: "timestamp", nullable: true })
  consumedAt?: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}

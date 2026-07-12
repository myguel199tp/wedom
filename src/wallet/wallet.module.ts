import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletService } from "./wallet.service";
import { WalletController } from "./wallet.controller";
import { Account } from "./entities/account.entity";
import { Transaction } from "./entities/transaction.entity";
import { LedgerEntry } from "./entities/ledger-entry.entity";
import { TransferChallenge } from "./entities/transfer-challenge.entity";
import { User } from "src/auth/entities/user.entity";
import { AuthModule } from "src/auth/auth.module";
import { MailerModule } from "src/mailer/mailer.module";
import { EventsModule } from "src/events/events.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Transaction,
      LedgerEntry,
      TransferChallenge,
      User,
    ]),
    AuthModule,
    MailerModule,
    EventsModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

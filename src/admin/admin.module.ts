import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";
import { AdminRepository } from "./admin.repository";
import { Transaction } from "src/wallet/entities/transaction.entity";
import { LedgerEntry } from "src/wallet/entities/ledger-entry.entity";
import { Account } from "src/wallet/entities/account.entity";
import { User } from "src/auth/entities/user.entity";
import { AuthModule } from "src/auth/auth.module";
import { WalletModule } from "src/wallet/wallet.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, LedgerEntry, Account, User]),
    AuthModule,
    WalletModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}

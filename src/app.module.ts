import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

import { User } from "./auth/entities/user.entity";
import { Account } from "./wallet/entities/account.entity";
import { Transaction } from "./wallet/entities/transaction.entity";
import { LedgerEntry } from "./wallet/entities/ledger-entry.entity";
import { TransferChallenge } from "./wallet/entities/transfer-challenge.entity";

import { AuthModule } from "./auth/auth.module";
import { WalletModule } from "./wallet/wallet.module";
import { AdminModule } from "./admin/admin.module";
import { MailerModule } from "./mailer/mailer.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("DB_HOST"),
        port: Number(config.get("DB_PORT") ?? 5432),
        username: config.get<string>("DB_USERNAME"),
        password: config.get<string>("DB_PASSWORD"),
        database: config.get<string>("DB_NAME"),
        entities: [User, Account, Transaction, LedgerEntry, TransferChallenge],
        synchronize: config.get("DB_SYNCHRONIZE") === "true",
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    AuthModule,
    WalletModule,
    AdminModule,
    MailerModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

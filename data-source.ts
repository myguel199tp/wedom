import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { User } from './src/auth/entities/user.entity';
import { Account } from './src/wallet/entities/account.entity';
import { Transaction } from './src/wallet/entities/transaction.entity';
import { LedgerEntry } from './src/wallet/entities/ledger-entry.entity';
import { TransferChallenge } from './src/wallet/entities/transfer-challenge.entity';

/**
 * DataSource para la CLI de TypeORM (migraciones). La app en runtime usa la
 * configuración de app.module.ts. En producción se usaría migrations en lugar
 * de synchronize.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Account, Transaction, LedgerEntry, TransferChallenge],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

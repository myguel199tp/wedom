import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { hash } from "bcryptjs";
import { User, UserRole } from "./entities/user.entity";
import { Account } from "src/wallet/entities/account.entity";

@Injectable()
export class AdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger("AdminSeeder");

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = (this.config.get<string>("ADMIN_EMAIL") ?? "").toLowerCase();
    const password = this.config.get<string>("ADMIN_PASSWORD");
    if (!email || !password) return;

    const userRepo = this.dataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email } });
    if (existing) return;

    await this.dataSource.transaction(async (manager) => {
      const admin = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          fullName: "Administrador",
          email,
          password: await hash(password, 10),
          role: UserRole.ADMIN,
        }),
      );
      await manager
        .getRepository(Account)
        .save(
          manager
            .getRepository(Account)
            .create({ userId: admin.id, balanceCents: 0 }),
        );
    });

    this.logger.log(`Usuario admin creado: ${email}`);
  }
}

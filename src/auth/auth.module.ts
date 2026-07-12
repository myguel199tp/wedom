import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { User } from "./entities/user.entity";
import { Account } from "src/wallet/entities/account.entity";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { AdminSeeder } from "./admin.seeder";
import { MailerModule } from "src/mailer/mailer.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Account]),
    MailerModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN") ?? "24h",
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, AdminSeeder],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, TypeOrmModule],
})
export class AuthModule {}

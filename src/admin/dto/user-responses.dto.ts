import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "src/auth/entities/user.entity";
import { PaginationDto } from "src/wallet/dto/wallet-responses.dto";

export class AdminUserDto {
  @ApiProperty({ example: "a1b2c3d4-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiProperty({ example: "Ana Pérez" })
  fullName: string;

  @ApiProperty({ example: "ana@test.com" })
  email: string;

  @ApiProperty({ example: UserRole.USER, enum: UserRole })
  role: UserRole;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  createdAt: Date;
}

export class UserListResponseDto {
  @ApiProperty({ type: [AdminUserDto] })
  data: AdminUserDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

export class AdminUserTransactionDto {
  @ApiProperty({ example: "f0e1d2c3-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiProperty({ example: 150.5 })
  amount: number;

  @ApiProperty({ example: "USD" })
  currency: string;

  @ApiProperty({
    example: "COMPLETED",
    enum: ["COMPLETED", "PENDING_REVIEW", "REJECTED"],
  })
  status: string;

  @ApiProperty({ example: "SENT", enum: ["SENT", "RECEIVED"] })
  direction: string;

  @ApiPropertyOptional({
    example: "beto@test.com",
    description: "Email de la contraparte de la transferencia.",
  })
  counterpartyEmail?: string;

  @ApiPropertyOptional({ example: "Pago del almuerzo" })
  description?: string;

  @ApiPropertyOptional({ example: "AMOUNT_ABOVE_THRESHOLD" })
  reviewReason?: string;

  @ApiPropertyOptional({ example: "Rechazada por cumplimiento" })
  rejectionReason?: string;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  createdAt: Date;
}

export class UserTransactionsResponseDto {
  @ApiProperty({ type: AdminUserDto })
  user: AdminUserDto;

  @ApiProperty({ type: [AdminUserTransactionDto] })
  data: AdminUserTransactionDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

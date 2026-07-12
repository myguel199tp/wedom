import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaginationDto } from "src/wallet/dto/wallet-responses.dto";

export class AuditEntryDto {
  @ApiProperty({ example: "9a8b7c6d-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiProperty({ example: "f0e1d2c3-0000-4444-8888-abcdefabcdef" })
  transactionId: string;

  @ApiProperty({ example: "a1b2c3d4-0000-4444-8888-abcdefabcdef" })
  accountId: string;

  @ApiPropertyOptional({
    example: "ana@test.com",
    description: "Titular de la cuenta afectada por el movimiento.",
  })
  accountOwner?: string;

  @ApiProperty({ example: "DEBIT", enum: ["DEBIT", "CREDIT"] })
  direction: string;

  @ApiProperty({ example: 150.5, description: "Monto del movimiento en USD." })
  amount: number;

  @ApiProperty({
    example: 4849.5,
    description: "Saldo disponible de la cuenta justo después del movimiento.",
  })
  balanceAfter: number;

  @ApiPropertyOptional({ example: "Transferencia enviada" })
  memo?: string;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  createdAt: Date;
}

export class AuditListResponseDto {
  @ApiProperty({ type: [AuditEntryDto] })
  data: AuditEntryDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

export class ReconciliationResponseDto {
  @ApiProperty({
    example: true,
    description:
      "true si el libro mayor cuadra: Σdébitos − Σcréditos = dinero retenido.",
  })
  balanced: boolean;

  @ApiProperty({
    example: 12500.0,
    description: "Suma de todos los débitos registrados en el ledger.",
  })
  totalDebits: number;

  @ApiProperty({
    example: 11000.0,
    description: "Suma de todos los créditos registrados en el ledger.",
  })
  totalCredits: number;

  @ApiProperty({
    example: 1500.0,
    description:
      "Débitos − créditos: dinero debitado pero aún no acreditado (retenido).",
  })
  netHeld: number;

  @ApiProperty({
    example: 1500.0,
    description: "Suma de los montos de las transacciones en PENDING_REVIEW.",
  })
  totalPendingReview: number;

  @ApiProperty({
    example: 98500.0,
    description: "Suma de los saldos disponibles de todas las cuentas.",
  })
  totalAvailableBalance: number;
}

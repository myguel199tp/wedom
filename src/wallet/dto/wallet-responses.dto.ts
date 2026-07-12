import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BalanceResponseDto {
  @ApiProperty({ example: "a1b2c3d4-0000-4444-8888-abcdefabcdef" })
  accountId: string;

  @ApiProperty({ example: "USD" })
  currency: string;

  @ApiProperty({ example: 4850.75, description: "Saldo disponible en USD." })
  availableBalance: number;

  @ApiProperty({ example: 0, description: "Saliente retenido en revisión." })
  pendingOutgoing: number;
}

export class TransactionResponseDto {
  @ApiProperty({ example: "f0e1d2c3-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiPropertyOptional({ example: "req-2026-07-09-0001" })
  reference?: string;

  @ApiProperty({ example: 150.5 })
  amount: number;

  @ApiProperty({ example: "USD" })
  currency: string;

  @ApiProperty({
    example: "COMPLETED",
    enum: ["COMPLETED", "PENDING_REVIEW", "REJECTED"],
  })
  status: string;

  @ApiPropertyOptional({ example: "AMOUNT_ABOVE_THRESHOLD" })
  reviewReason?: string;

  @ApiPropertyOptional({ example: "Pago del almuerzo" })
  description?: string;

  @ApiPropertyOptional({ example: "SENT", enum: ["SENT", "RECEIVED"] })
  direction?: string;

  @ApiProperty({ example: "a1b2c3d4-0000-4444-8888-abcdefabcdef" })
  senderAccountId: string;

  @ApiProperty({ example: "b2c3d4e5-0000-4444-8888-abcdefabcdef" })
  receiverAccountId: string;

  @ApiPropertyOptional({ example: "Rechazada por cumplimiento" })
  rejectionReason?: string;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  createdAt: Date;
}

export class OtpChallengeResponseDto {
  @ApiProperty({ example: true })
  requiresOtp: boolean;

  @ApiProperty({ example: "c3d4e5f6-0000-4444-8888-abcdefabcdef" })
  challengeId: string;

  @ApiProperty({ example: 1500 })
  amount: number;

  @ApiProperty({ example: "2026-07-10T19:05:00.000Z" })
  expiresAt: Date;

  @ApiProperty({
    example:
      "Transferencia > umbral: te enviamos un código por correo para confirmar.",
  })
  message: string;

  @ApiPropertyOptional({
    example: "123456",
    description: "Solo fuera de producción, para pruebas.",
  })
  debugCode?: string;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

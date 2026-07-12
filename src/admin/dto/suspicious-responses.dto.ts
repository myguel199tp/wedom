import { ApiProperty } from "@nestjs/swagger";
import { PaginationDto } from "src/wallet/dto/wallet-responses.dto";

export class SuspiciousTransactionDto {
  @ApiProperty({ example: "f0e1d2c3-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiProperty({ example: 1500.0 })
  amount: number;

  @ApiProperty({ example: "USD" })
  currency: string;

  @ApiProperty({
    example: "PENDING_REVIEW",
    enum: ["COMPLETED", "PENDING_REVIEW", "REJECTED"],
  })
  status: string;

  @ApiProperty({ example: "ana@test.com" })
  senderEmail: string;

  @ApiProperty({ example: "beto@test.com" })
  receiverEmail: string;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  createdAt: Date;

  @ApiProperty({
    example: ["LARGE_AMOUNT"],
    enum: [
      "LARGE_AMOUNT",
      "VERY_LARGE_AMOUNT",
      "HIGH_VELOCITY",
      "STRUCTURING",
      "ODD_HOURS",
      "REJECTED_BY_COMPLIANCE",
    ],
    isArray: true,
    description: "Motivos por los que la transferencia fue marcada.",
  })
  reasons: string[];

  @ApiProperty({
    example: 2,
    description: "Transferencias del emisor dentro de la ventana de velocidad.",
  })
  senderRecentCount: number;
}

export class SuspiciousCriteriaDto {
  @ApiProperty({ example: 1000 })
  largeAmountAboveUsd: number;

  @ApiProperty({
    example: 3000,
    description: "Umbral de monto 'muy superior' (VERY_LARGE_AMOUNT).",
  })
  veryLargeAmountAboveUsd: number;

  @ApiProperty({ example: 5 })
  highVelocityMoreThan: number;

  @ApiProperty({ example: 60 })
  velocityWindowSeconds: number;

  @ApiProperty({
    example: 3,
    description:
      "Mínimo de envíos pequeños (< umbral) para marcar STRUCTURING.",
  })
  structuringMinCount: number;

  @ApiProperty({
    example: 3600,
    description: "Ventana (segundos) en que se evalúa la fragmentación.",
  })
  structuringWindowSeconds: number;

  @ApiProperty({
    example: 0,
    description: "Hora local de inicio de la franja horaria inusual (ODD_HOURS).",
  })
  oddHoursFrom: number;

  @ApiProperty({
    example: 5,
    description: "Hora local de fin de la franja horaria inusual (ODD_HOURS).",
  })
  oddHoursTo: number;

  @ApiProperty({
    example: "America/Bogota",
    description: "Zona horaria de negocio usada para evaluar ODD_HOURS.",
  })
  timezone: string;
}

export class SuspiciousListResponseDto {
  @ApiProperty({ type: SuspiciousCriteriaDto })
  criteria: SuspiciousCriteriaDto;

  @ApiProperty({ type: [SuspiciousTransactionDto] })
  data: SuspiciousTransactionDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

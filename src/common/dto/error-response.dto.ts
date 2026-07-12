import { ApiProperty } from "@nestjs/swagger";

/**
 * Forma estándar de error que produce AllExceptionsFilter.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({
    example: "INSUFFICIENT_FUNDS",
    description: "Código de negocio del error.",
  })
  code: string;

  @ApiProperty({ example: "Fondos insuficientes para la transferencia." })
  message: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: "Datos adicionales del error (opcional).",
    example: { availableBalance: 12.5, requested: 100 },
  })
  details?: unknown;

  @ApiProperty({ example: "/api/wallet/transfer" })
  path: string;

  @ApiProperty({ example: "2026-07-10T18:55:00.000Z" })
  timestamp: string;
}

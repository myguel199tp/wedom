import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class AuditQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: "Filtrar por cuenta (audita todos los movimientos de una cuenta).",
    example: "a1b2c3d4-0000-4444-8888-abcdefabcdef",
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description:
      "Filtrar por transacción (muestra la partida doble de una operación).",
    example: "f0e1d2c3-0000-4444-8888-abcdefabcdef",
  })
  @IsOptional()
  @IsUUID()
  transactionId?: string;
}

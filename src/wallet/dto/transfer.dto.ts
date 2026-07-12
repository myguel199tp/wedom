import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class TransferDto {
  @ApiProperty({ example: 'bob@miniwallet.local', description: 'Correo del usuario destino' })
  @IsEmail({}, { message: 'El correo del destinatario no es válido.' })
  recipientEmail: string;

  @ApiProperty({ example: 150.5, description: 'Monto en USD, mayor a cero' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto admite máximo 2 decimales.' })
  @IsPositive({ message: 'El monto debe ser mayor a cero.' })
  @Min(0.01, { message: 'El monto mínimo es 0.01.' })
  amount: number;

  @ApiPropertyOptional({ example: 'Pago del almuerzo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    example: 'req-2026-07-09-0001',
    description:
      'Clave de idempotencia. Reintentar con la misma clave NO ejecuta la transferencia dos veces.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

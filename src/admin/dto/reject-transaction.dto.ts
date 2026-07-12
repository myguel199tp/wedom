import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectTransactionDto {
  @ApiPropertyOptional({ example: 'Origen de fondos no verificado' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

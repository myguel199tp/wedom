import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class ConfirmTransferDto {
  @ApiProperty({ description: 'Id del desafío devuelto por POST /wallet/transfer' })
  @IsUUID()
  challengeId: string;

  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos recibido por correo' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos.' })
  code: string;
}

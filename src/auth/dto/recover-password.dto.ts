import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RecoverPasswordDto {
  @ApiProperty({ example: 'ana@miniwallet.local', format: 'email' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  email: string;
}

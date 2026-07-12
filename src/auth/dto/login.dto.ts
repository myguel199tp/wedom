import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@miniwallet.local', format: 'email' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  email: string;

  @ApiProperty({ example: 'Secret123*' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @IsString()
  password: string;
}

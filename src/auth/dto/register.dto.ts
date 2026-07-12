import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ana Pérez' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'ana@miniwallet.local', format: 'email' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  email: string;

  @ApiProperty({ example: 'Secret123*', minLength: 6 })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;
}

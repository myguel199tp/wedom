import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido por correo' })
  @IsNotEmpty({ message: 'El token es obligatorio.' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NuevaClave123*', minLength: 6 })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  newPassword: string;
}

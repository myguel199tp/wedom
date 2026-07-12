import { ApiProperty } from "@nestjs/swagger";

export class UserProfileDto {
  @ApiProperty({ example: "d4e5f6a7-0000-4444-8888-abcdefabcdef" })
  id: string;

  @ApiProperty({ example: "Ana Pérez" })
  fullName: string;

  @ApiProperty({ example: "ana@miniwallet.local" })
  email: string;

  @ApiProperty({ example: "user", enum: ["user", "admin"] })
  role: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    description: "JWT para usar en el header Authorization: Bearer <token>.",
  })
  accessToken: string;

  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}

export class SimpleSuccessDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    required: false,
    example: "Si el correo está registrado, recibirás instrucciones.",
  })
  message?: string;
}

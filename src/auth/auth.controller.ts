import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  LoginResponseDto,
  SimpleSuccessDto,
  UserProfileDto,
} from './dto/auth-responses.dto';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registro de usuario (elige su propia contraseña)' })
  @ApiCreatedResponse({ type: UserProfileDto, description: 'Usuario creado.' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Datos inválidos o correo ya registrado.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login: devuelve un JWT' })
  @ApiOkResponse({ type: LoginResponseDto, description: 'JWT y datos del usuario.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Credenciales inválidas o cuenta bloqueada.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('recover-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña (envía correo)' })
  @ApiOkResponse({ type: SimpleSuccessDto, description: 'Respuesta genérica (no revela si el correo existe).' })
  recoverPassword(@Body() dto: RecoverPasswordDto) {
    return this.authService.requestPasswordRecovery(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña con el token del correo' })
  @ApiOkResponse({ type: SimpleSuccessDto, description: 'Contraseña actualizada.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Token inválido o expirado.' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Token ausente o inválido.' })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }
}

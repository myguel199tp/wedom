import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { TransferDto } from './dto/transfer.dto';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import {
  BalanceResponseDto,
  OtpChallengeResponseDto,
  TransactionListResponseDto,
  TransactionResponseDto,
} from './dto/wallet-responses.dto';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';

@ApiTags('wallet')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Token ausente o inválido.' })
@ApiExtraModels(TransactionResponseDto, OtpChallengeResponseDto)
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Saldo disponible y pendiente del usuario' })
  @ApiOkResponse({ type: BalanceResponseDto })
  balance(@CurrentUser() user: JwtPayload) {
    return this.walletService.getBalance(user.sub);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transferir saldo. Montos > umbral devuelven un desafío OTP.',
    description:
      'Si el monto es <= umbral, ejecuta y devuelve la transacción. Si es > umbral, ' +
      'devuelve { requiresOtp, challengeId } y se debe confirmar en /wallet/transfer/confirm.',
  })
  @ApiOkResponse({
    description:
      'Transacción ejecutada (monto <= umbral) o desafío OTP (monto > umbral).',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(TransactionResponseDto) },
        { $ref: getSchemaPath(OtpChallengeResponseDto) },
      ],
    },
  })
  transfer(@CurrentUser() user: JwtPayload, @Body() dto: TransferDto) {
    return this.walletService.transfer(user.sub, dto);
  }

  @Post('transfer/confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Confirmar con OTP una transferencia > umbral' })
  @ApiCreatedResponse({ type: TransactionResponseDto })
  confirmTransfer(@CurrentUser() user: JwtPayload, @Body() dto: ConfirmTransferDto) {
    return this.walletService.confirmTransfer(user.sub, dto.challengeId, dto.code);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Historial de transacciones (paginado)' })
  @ApiOkResponse({ type: TransactionListResponseDto })
  history(@CurrentUser() user: JwtPayload, @Query() query: HistoryQueryDto) {
    return this.walletService.history(user.sub, query.page, query.limit);
  }
}

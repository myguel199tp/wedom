import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { WalletService } from 'src/wallet/wallet.service';
import { RejectTransactionDto } from './dto/reject-transaction.dto';
import { HistoryQueryDto } from 'src/wallet/dto/history-query.dto';
import {
  TransactionListResponseDto,
  TransactionResponseDto,
} from 'src/wallet/dto/wallet-responses.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import {
  AuditListResponseDto,
  ReconciliationResponseDto,
} from './dto/audit-responses.dto';
import {
  UserListResponseDto,
  UserTransactionsResponseDto,
} from './dto/user-responses.dto';
import { SuspiciousListResponseDto } from './dto/suspicious-responses.dto';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/auth/entities/user.entity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Requiere rol admin.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly walletService: WalletService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios registrados, paginado (solo admin)' })
  @ApiOkResponse({ type: UserListResponseDto })
  users(@Query() query: HistoryQueryDto) {
    return this.adminService.listUsers(query.page, query.limit);
  }

  @Get('users/:id/transactions')
  @ApiOperation({
    summary: 'Historial de transacciones de un usuario (solo admin)',
    description:
      'Auditoría: enviadas y recibidas en todos los estados (completadas, en revisión y rechazadas).',
  })
  @ApiOkResponse({ type: UserTransactionsResponseDto })
  userTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.adminService.userTransactions(id, query.page, query.limit);
  }

  @Get('transactions/suspicious')
  @ApiOperation({ summary: 'Listar transacciones sospechosas (solo admin)' })
  @ApiOkResponse({ type: SuspiciousListResponseDto })
  suspicious(@Query() query: HistoryQueryDto) {
    return this.adminService.suspicious(query.page, query.limit);
  }

  @Get('audit/ledger')
  @ApiOperation({
    summary:
      'Auditoría: libro mayor de partida doble, paginado (solo admin)',
    description:
      'Rastro contable append-only de todos los movimientos. Filtrable por accountId o transactionId.',
  })
  @ApiOkResponse({ type: AuditListResponseDto })
  auditLedger(@Query() query: AuditQueryDto) {
    return this.adminService.auditLedger(query);
  }

  @Get('audit/reconciliation')
  @ApiOperation({
    summary: 'Auditoría: conciliación del invariante de conservación (solo admin)',
    description:
      'Verifica que Σdébitos − Σcréditos = dinero retenido (PENDING_REVIEW). Si balanced=false, el libro no cuadra.',
  })
  @ApiOkResponse({ type: ReconciliationResponseDto })
  reconciliation() {
    return this.adminService.reconciliation();
  }

  @Patch('transactions/:id/approve')
  @ApiOperation({ summary: 'Aprobar una transferencia en revisión de cumplimiento' })
  @ApiOkResponse({ type: TransactionResponseDto })
  approve(@CurrentUser() admin: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.walletService.approveTransfer(admin.sub, id);
  }

  @Patch('transactions/:id/reject')
  @ApiOperation({ summary: 'Rechazar una transferencia en revisión (reversa el saldo)' })
  @ApiOkResponse({ type: TransactionResponseDto })
  reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransactionDto,
  ) {
    return this.walletService.rejectTransfer(admin.sub, id, dto.reason);
  }
}

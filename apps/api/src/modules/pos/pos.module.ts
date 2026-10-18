import { Body, Controller, Get, Headers, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { StockModule } from '../stock/stock.module';
import { CashService } from './cash.service';
import {
  AbandonSaleDto,
  AuthorizeDto,
  CancelSaleDto,
  CashMovementDto,
  CloseCashDto,
  CreateSaleDto,
  ListCashSessionsQueryDto,
  ListSalesQueryDto,
  OpenCashDto,
  SalesReportQueryDto,
  TerminalQueryDto,
} from './pos.dto';
import { ReceivablesController, ReturnsController, StoreCreditsController } from './post-sale.controller';
import { ReceivablesService } from './receivables.service';
import { ReturnsService } from './returns.service';
import { SalesReportService } from './sales-report.service';
import { StoreCreditsService } from './store-credits.service';
import { SalesService } from './sales.service';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

/** Cabeçalho com o token de autorização do supervisor (quando o operador não tem a permissão). */
const SUPERVISOR_HEADER = 'x-supervisor-token';

@Controller('pos')
class PosController {
  constructor(private readonly authorization: SupervisorAuthorizationService) {}

  /** Supervisor digita usuário + PIN no caixa e libera uma ação para o operador. */
  @Post('authorize')
  @HttpCode(200)
  @RequirePermissions(Permission.POS_SELL)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  authorize(@Body() dto: AuthorizeDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.authorization.authorize(user, dto, ip);
  }
}

@Controller('cash')
class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('current')
  @RequirePermissions(Permission.POS_SELL)
  current(@Query() { terminal }: TerminalQueryDto) {
    return this.cash.current(terminal);
  }

  @Post('open')
  @RequirePermissions(Permission.POS_SELL)
  open(@Body() dto: OpenCashDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.cash.open(dto, user, ip);
  }

  @Post(':id/movements')
  @RequirePermissions(Permission.POS_SELL)
  movement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashMovementDto,
    @CurrentUser() user: AuthUser,
    @Headers(SUPERVISOR_HEADER) token: string | undefined,
    @ClientIp() ip: string,
  ) {
    return this.cash.addMovement(id, dto, user, token, ip);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(Permission.POS_SELL)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.cash.close(id, dto, user, ip);
  }

  @Get('sessions')
  @RequirePermissions(Permission.SALES_READ)
  list(@Query() query: ListCashSessionsQueryDto) {
    return this.cash.list(query);
  }

  @Get('sessions/:id')
  @RequirePermissions(Permission.POS_SELL)
  report(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.cash.report(id, user);
  }
}

@Controller('sales')
class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly reports: SalesReportService,
  ) {}

  @Post()
  @RequirePermissions(Permission.POS_SELL)
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
    @Headers(SUPERVISOR_HEADER) token: string | undefined,
    @ClientIp() ip: string,
  ) {
    return this.sales.create(dto, user, token, ip);
  }

  @Get()
  @RequirePermissions(Permission.POS_SELL)
  list(@Query() query: ListSalesQueryDto, @CurrentUser() user: AuthUser) {
    return this.sales.list(query, user);
  }

  /** Cupom cancelado inteiro antes de finalizar: registra na auditoria quem cancelou e o que tinha. */
  @Post('abandon')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  abandon(@Body() dto: AbandonSaleDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.sales.logAbandon(dto, user, ip);
  }

  /** Relatório de vendas do período (padrão: hoje). Declarado antes de ":id". */
  @Get('report')
  @RequirePermissions(Permission.SALES_READ)
  report(@Query() query: SalesReportQueryDto) {
    return this.reports.report(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.POS_SELL)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sales.findOne(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.POS_SELL)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: AuthUser,
    @Headers(SUPERVISOR_HEADER) token: string | undefined,
    @ClientIp() ip: string,
  ) {
    return this.sales.cancel(id, dto, user, token, ip);
  }

  /** Registra na auditoria a reimpressão feita pelo navegador. */
  @Post(':id/reprint')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  reprint(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.sales.logReprint(id, user, ip);
  }
}

@Module({
  imports: [StockModule],
  controllers: [PosController, CashController, SalesController, ReturnsController, StoreCreditsController, ReceivablesController],
  providers: [
    SupervisorAuthorizationService,
    CashService,
    SalesService,
    SalesReportService,
    StoreCreditsService,
    ReceivablesService,
    ReturnsService,
  ],
  exports: [CashService, SalesService, ReceivablesService, StoreCreditsService],
})
export class PosModule {}

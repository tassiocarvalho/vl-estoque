import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { badRequest } from '../../common/errors';
import {
  CancelReceivableDto,
  CreateReceiptDto,
  CreateReturnDto,
  ListCreditsQueryDto,
  ListReceivablesQueryDto,
  ListReturnsQueryDto,
  LookupCreditQueryDto,
} from './post-sale.dto';
import { ReceivablesService } from './receivables.service';
import { ReturnsService } from './returns.service';
import { StoreCreditsService } from './store-credits.service';

const SUPERVISOR_HEADER = 'x-supervisor-token';

class PreviewQueryDto {
  @IsOptional() @IsUUID()
  saleId?: string;

  /** Número da venda (impresso no comprovante). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  number?: number;
}

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  /** O que ainda pode ser devolvido da venda (pelo id ou pelo número do comprovante). */
  @Get('preview')
  @RequirePermissions(Permission.POS_SELL)
  preview(@Query() query: PreviewQueryDto) {
    if (!query.saleId && !query.number) throw badRequest('Informe o número da venda');
    return this.returns.preview(query);
  }

  @Post()
  @RequirePermissions(Permission.POS_SELL)
  create(
    @Body() dto: CreateReturnDto,
    @CurrentUser() user: AuthUser,
    @Headers(SUPERVISOR_HEADER) token: string | undefined,
    @ClientIp() ip: string,
  ) {
    return this.returns.create(dto, user, token, ip);
  }

  @Get()
  @RequirePermissions(Permission.SALES_READ)
  list(@Query() query: ListReturnsQueryDto) {
    return this.returns.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.POS_SELL)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.findOne(id);
  }
}

@Controller('store-credits')
export class StoreCreditsController {
  constructor(private readonly credits: StoreCreditsService) {}

  /** Confere o vale no caixa pelo código impresso. */
  @Get('lookup')
  @RequirePermissions(Permission.POS_SELL)
  lookup(@Query() { code }: LookupCreditQueryDto) {
    return this.credits.lookup(code);
  }

  @Get()
  @RequirePermissions(Permission.CUSTOMER_READ)
  list(@Query() query: ListCreditsQueryDto) {
    return this.credits.list({ customerId: query.customerId, activeOnly: query.active });
  }

  @Get(':id')
  @RequirePermissions(Permission.POS_SELL)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.credits.findOne(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.credits.cancel(id, user, ip);
  }
}

@Controller()
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  @Get('receivables')
  @RequirePermissions(Permission.FINANCE_READ)
  list(@Query() query: ListReceivablesQueryDto) {
    return this.receivables.list(query);
  }

  /** Inadimplência: em aberto, vencido por faixa de atraso e maiores devedores. */
  @Get('receivables/summary')
  @RequirePermissions(Permission.FINANCE_READ)
  summary() {
    return this.receivables.summary();
  }

  @Post('receivables/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.FINANCE_MANAGE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() { reason }: CancelReceivableDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.receivables.cancel(id, reason, user, ip);
  }

  /** Limite, saldo devedor, vencidos e vales do cliente (caixa e cadastro). */
  @Get('customers/:id/credit')
  @RequirePermissions(Permission.CUSTOMER_READ)
  credit(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivables.creditInfo(id);
  }

  @Get('customers/:id/statement')
  @RequirePermissions(Permission.CUSTOMER_READ)
  statement(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivables.statement(id);
  }

  /** Recebimento do fiado no caixa. */
  @Post('receipts')
  @RequirePermissions(Permission.POS_SELL)
  receive(@Body() dto: CreateReceiptDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.receivables.receive(dto, user, ip);
  }

  @Get('receipts/:id')
  @RequirePermissions(Permission.POS_SELL)
  receipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivables.findReceipt(id);
  }
}

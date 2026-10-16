import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { Socket } from 'node:net';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashService } from '../pos/cash.service';
import { PosModule } from '../pos/pos.module';
import { SalesService } from '../pos/sales.service';
import { SettingsService } from '../settings/settings.service';
import { EscPosBuilder } from './escpos';
import { cashMovementReceipt, cashReport, saleReceipt, testPage } from './receipts';

const CONNECT_TIMEOUT_MS = 5_000;

class PrintSaleDto {
  /** Reimpressão: o comprovante sai marcado como "2ª via" e fica registrado na auditoria. */
  @IsOptional()
  @IsBoolean()
  copy?: boolean;
}

/**
 * Impressão direta em impressora térmica de rede (TCP, porta 9100 — padrão "RAW"/JetDirect).
 * Sai sem a janela de impressão do navegador, o que agiliza o caixa.
 * Impressoras USB/serial usam a impressão pelo navegador com o driver do fabricante.
 */
@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(private readonly settings: SettingsService) {}

  async columns() {
    const { printer } = await this.settings.get();
    return printer.paper === '58mm' ? 32 : 48;
  }

  async send(data: Buffer) {
    const { printer } = await this.settings.get();
    if (printer.connection !== 'network' || !printer.host) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Impressora de rede não configurada (Configurações → Impressão)');
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const fail = (error: Error) => {
        socket.destroy();
        this.logger.warn(`Falha ao imprimir em ${printer.host}:${printer.port}: ${error.message}`);
        reject(
          new AppException(
            HttpStatus.BAD_GATEWAY,
            `Não foi possível falar com a impressora ${printer.host}:${printer.port}. Verifique se ela está ligada e na rede.`,
          ),
        );
      };
      socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error('tempo esgotado')));
      socket.once('error', fail);
      socket.connect(printer.port, printer.host, () => {
        socket.end(data, () => resolve());
      });
    });
  }
}

@Controller('printing')
class PrintingController {
  constructor(
    private readonly printing: PrintingService,
    private readonly settings: SettingsService,
    private readonly sales: SalesService,
    private readonly cash: CashService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('sales/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  async sale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrintSaleDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    const sale = await this.sales.findOne(id, user);
    const { store, printer } = await this.settings.get();
    const openDrawer = !dto.copy && printer.openDrawerOnCash && sale.payments.some((p) => p.method === 'CASH');
    await this.printing.send(saleReceipt(sale, store, await this.printing.columns(), { copy: dto.copy, openDrawer }));
    if (dto.copy) await this.sales.logReprint(id, user, ip);
    if (openDrawer) await this.logDrawer(user, ip, `venda nº ${sale.number}`);
  }

  @Post('cash-sessions/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  async cashSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const report = await this.cash.report(id, user);
    const { store } = await this.settings.get();
    await this.printing.send(cashReport(report, store, await this.printing.columns()));
  }

  @Post('cash-movements/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  async cashMovement(@Param('id', ParseUUIDPipe) id: string) {
    const movement = await this.prisma.cashMovement.findUnique({
      where: { id },
      include: {
        session: { select: { terminal: true } },
        user: { select: { name: true } },
        authorizedBy: { select: { name: true } },
      },
    });
    if (!movement) throw notFound('Movimento de caixa');
    const { store } = await this.settings.get();
    await this.printing.send(
      cashMovementReceipt(
        { ...movement, amount: toNumber(movement.amount), terminal: movement.session.terminal },
        store,
        await this.printing.columns(),
      ),
    );
  }

  /** Abre a gaveta de dinheiro sem venda (fica registrado na auditoria). */
  @Post('drawer')
  @HttpCode(204)
  @RequirePermissions(Permission.POS_SELL)
  async drawer(@CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    await this.printing.send(new EscPosBuilder(await this.printing.columns()).openDrawer().build());
    await this.logDrawer(user, ip, 'abertura manual');
  }

  @Post('test')
  @HttpCode(204)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async test() {
    const { store } = await this.settings.get();
    await this.printing.send(testPage(store, await this.printing.columns()));
  }

  private logDrawer(user: AuthUser, ip: string, reason: string) {
    return this.audit.log({ userId: user.id, action: 'cash.drawer-open', entity: 'cash', details: { reason }, ip });
  }
}

@Module({
  imports: [PosModule],
  controllers: [PrintingController],
  providers: [PrintingService],
})
export class PrintingModule {}

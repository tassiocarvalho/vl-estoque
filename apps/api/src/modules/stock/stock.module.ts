import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions, RequirePin } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { ListMovementsQueryDto, RegisterEntryDto, RegisterExitDto } from './stock.dto';
import { StockService } from './stock.service';

/**
 * Limite maior que o padrão: no "registro rápido" cada bipagem é uma requisição, e a fila
 * offline de um turno inteiro é enviada de uma vez quando a internet volta.
 * As rotas exigem sessão e PIN (que tem bloqueio próprio contra tentativas).
 */
const MOVEMENT_THROTTLE = { default: { limit: 1200, ttl: 60_000 } };

@Controller('stock')
class StockController {
  constructor(private readonly stock: StockService) {}

  @Post('entries')
  @Throttle(MOVEMENT_THROTTLE)
  @RequirePermissions(Permission.STOCK_IN)
  @RequirePin('stockIn')
  registerEntry(@Body() dto: RegisterEntryDto, @CurrentUser() user: AuthUser) {
    return this.stock.register({ ...dto, userId: user.id });
  }

  @Post('exits')
  @Throttle(MOVEMENT_THROTTLE)
  @RequirePermissions(Permission.STOCK_OUT)
  @RequirePin('stockOut')
  registerExit(@Body() dto: RegisterExitDto, @CurrentUser() user: AuthUser) {
    return this.stock.register({ ...dto, userId: user.id });
  }

  @Get('movements')
  @RequirePermissions(Permission.MOVEMENT_READ)
  list(@Query() query: ListMovementsQueryDto) {
    return this.stock.list(query);
  }
}

@Module({
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}

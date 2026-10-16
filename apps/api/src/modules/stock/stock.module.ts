import { Body, Controller, ForbiddenException, Get, Module, Post, Query } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions, RequirePin } from '../../common/auth/decorators';
import { hasPermission, Permission } from '../../common/auth/permissions';
import { ADJUSTMENT_TYPES, ListMovementsQueryDto, RegisterEntryDto, RegisterExitDto } from './stock.dto';
import { StockService } from './stock.service';

/** Ajuste manual de inventário é restrito ao administrador. */
function assertCanAdjust(user: AuthUser, type: MovementType) {
  if (ADJUSTMENT_TYPES.includes(type) && !hasPermission(user.role, Permission.STOCK_ADJUST)) {
    throw new ForbiddenException('Somente o administrador pode registrar ajustes de estoque');
  }
}

@Controller('stock')
class StockController {
  constructor(private readonly stock: StockService) {}

  @Post('entries')
  @RequirePermissions(Permission.STOCK_IN)
  @RequirePin('stockIn')
  registerEntry(@Body() dto: RegisterEntryDto, @CurrentUser() user: AuthUser) {
    assertCanAdjust(user, dto.type);
    return this.stock.register({ ...dto, userId: user.id });
  }

  @Post('exits')
  @RequirePermissions(Permission.STOCK_OUT)
  @RequirePin('stockOut')
  registerExit(@Body() dto: RegisterExitDto, @CurrentUser() user: AuthUser) {
    assertCanAdjust(user, dto.type);
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

import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions, RequirePin } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { ListMovementsQueryDto, RegisterEntryDto, RegisterExitDto } from './stock.dto';
import { StockService } from './stock.service';

@Controller('stock')
class StockController {
  constructor(private readonly stock: StockService) {}

  @Post('entries')
  @RequirePermissions(Permission.STOCK_IN)
  @RequirePin('stockIn')
  registerEntry(@Body() dto: RegisterEntryDto, @CurrentUser() user: AuthUser) {
    return this.stock.register({ ...dto, userId: user.id });
  }

  @Post('exits')
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

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions, RequirePin } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { CreateProductDto, ListProductsQueryDto, LookupQueryDto, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';
import { TrashService } from './trash.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCT_READ)
  list(@Query() query: ListProductsQueryDto) {
    return this.products.list(query);
  }

  @Get('lookup')
  @RequirePermissions(Permission.PRODUCT_READ)
  lookup(@Query() { code }: LookupQueryDto) {
    return this.products.lookup(code);
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCT_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findById(id);
  }

  @Post()
  @RequirePermissions(Permission.PRODUCT_WRITE)
  @RequirePin('productWrite')
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.products.create(dto, { id: user.id, ip });
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCT_WRITE)
  @RequirePin('productWrite')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.products.update(id, dto, { id: user.id, ip });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.PRODUCT_DELETE)
  @RequirePin('productDelete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.products.moveToTrash(id, { id: user.id, ip });
  }
}

@Controller('trash')
@RequirePermissions(Permission.TRASH_MANAGE)
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  list() {
    return this.trash.list();
  }

  @Post(':id/restore')
  @HttpCode(204)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.trash.restore(id, { id: user.id, ip });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePin('productDelete')
  purge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.trash.purge(id, { id: user.id, ip });
  }
}

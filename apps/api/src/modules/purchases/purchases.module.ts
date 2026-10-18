import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { StockModule } from '../stock/stock.module';
import { InvoicesService } from './invoices.service';
import {
  ImportXmlDto,
  ListInvoicesQueryDto,
  ListSuppliersQueryDto,
  ProductSupplierDto,
  SaveInvoiceDto,
  SupplierDto,
  UpdateSupplierDto,
} from './purchases.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions(Permission.PURCHASE_READ)
  list(@Query() query: ListSuppliersQueryDto) {
    return this.suppliers.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.PURCHASE_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  create(@Body() dto: SupplierDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.suppliers.create(dto, user, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.suppliers.update(id, dto, user, ip);
  }

  @Put(':id/products/:productId')
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ProductSupplierDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.suppliers.upsertLink(id, productId, dto, user, ip);
  }

  @Delete(':id/products/:productId')
  @HttpCode(204)
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.suppliers.removeLink(id, productId, user, ip);
  }
}

/** Fornecedores de um produto (detalhe do produto). */
@Controller('products')
class ProductSuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get(':id/suppliers')
  @RequirePermissions(Permission.PRODUCT_READ)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.links({ productId: id });
  }
}

@Controller('purchase-invoices')
class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(Permission.PURCHASE_READ)
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.PURCHASE_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.PURCHASE_MANAGE, Permission.STOCK_IN)
  create(@Body() dto: SaveInvoiceDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.invoices.create(dto, user, ip);
  }

  /** Lê o XML da NF-e e cria o rascunho da entrada. */
  @Post('import-xml')
  @RequirePermissions(Permission.PURCHASE_MANAGE, Permission.STOCK_IN)
  importXml(@Body() { xml }: ImportXmlDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.invoices.importXml(xml, user, ip);
  }

  @Put(':id')
  @RequirePermissions(Permission.PURCHASE_MANAGE, Permission.STOCK_IN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveInvoiceDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.invoices.update(id, dto, user, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.PURCHASE_MANAGE, Permission.STOCK_IN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.invoices.remove(id, user, ip);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  @RequirePermissions(Permission.PURCHASE_MANAGE, Permission.STOCK_IN)
  finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.invoices.finalize(id, user, ip);
  }
}

@Module({
  imports: [StockModule],
  controllers: [SuppliersController, ProductSuppliersController, InvoicesController],
  providers: [SuppliersService, InvoicesService],
  exports: [SuppliersService],
})
export class PurchasesModule {}

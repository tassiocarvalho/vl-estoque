import { Body, Controller, Get, Injectable, Module, Param, Post, UseGuards } from '@nestjs/common';
import { MovementSource, MovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsNumber, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { createHash } from 'node:crypto';
import { Public } from '../../common/auth/decorators';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';
import { StockModule } from '../stock/stock.module';
import { StockService } from '../stock/stock.service';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Adaptador de entrada para o sistema de caixa (PDV).
 *
 * O PDV chama esta API com o cabeçalho X-API-Key para:
 *  - consultar se há estoque de um produto antes de vender;
 *  - informar as vendas realizadas (baixa automática no estoque).
 *
 * As regras de estoque continuam no StockService: trocar de PDV exige mudar apenas este adaptador.
 */

class SaleItemDto {
  /** SKU ou código de barras. */
  @IsString()
  @Length(1, 40)
  code: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity: number;
}

class RegisterSaleDto {
  /** Identificador da venda no PDV (cupom/NFC-e). Reenviar a mesma venda não duplica a baixa. */
  @IsString()
  @Length(1, 80)
  externalId: string;

  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  items: SaleItemDto[];
}

/** UUID determinístico a partir do id da venda no PDV — garante idempotência. */
const deterministicUuid = (seed: string) => {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

@Injectable()
class PdvIntegrationService {
  constructor(
    private readonly products: ProductsService,
    private readonly stock: StockService,
  ) {}

  async availability(code: string) {
    const product = await this.products.lookup(code);
    return {
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      currentStock: product.currentStock,
      available: product.currentStock > 0,
    };
  }

  async registerSale({ externalId, items }: RegisterSaleDto) {
    const results = [];
    for (const [index, item] of items.entries()) {
      const product = await this.products.lookup(item.code);
      const { movement, duplicated } = await this.stock.register({
        id: deterministicUuid(`pdv:${externalId}:${index}`),
        productId: product.id,
        type: MovementType.OUT_SALE,
        quantity: item.quantity,
        note: `Venda PDV ${externalId}`,
        source: MovementSource.PDV,
        userId: null,
      });
      results.push({ code: item.code, balanceAfter: movement.balanceAfter, duplicated });
    }
    return { externalId, items: results };
  }
}

@Public()
@UseGuards(ApiKeyGuard)
@Controller('integration/pdv')
class PdvIntegrationController {
  constructor(private readonly pdv: PdvIntegrationService) {}

  @Get('products/:code/availability')
  availability(@Param('code') code: string) {
    return this.pdv.availability(code);
  }

  @Post('sales')
  registerSale(@Body() dto: RegisterSaleDto) {
    return this.pdv.registerSale(dto);
  }
}

@Module({
  imports: [ProductsModule, StockModule],
  controllers: [PdvIntegrationController],
  providers: [PdvIntegrationService],
})
export class IntegrationModule {}

import { Module } from '@nestjs/common';
import { ProductImportService } from './product-import.service';
import { ProductsController, TrashController } from './products.controller';
import { ProductsService } from './products.service';
import { TrashService } from './trash.service';

@Module({
  controllers: [ProductsController, TrashController],
  providers: [ProductsService, TrashService, ProductImportService],
  exports: [ProductsService],
})
export class ProductsModule {}

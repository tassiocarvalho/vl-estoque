import { Module } from '@nestjs/common';
import { ProductsController, TrashController } from './products.controller';
import { ProductsService } from './products.service';
import { TrashService } from './trash.service';

@Module({
  controllers: [ProductsController, TrashController],
  providers: [ProductsService, TrashService],
  exports: [ProductsService],
})
export class ProductsModule {}

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AuthGuard, PermissionsGuard, PinGuard } from './common/auth/guards';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CustomersModule } from './modules/customers/customers.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { PosModule } from './modules/pos/pos.module';
import { PrintingModule } from './modules/printing/printing.module';
import { ProductsModule } from './modules/products/products.module';
import { PurchaseRequestsModule } from './modules/purchase-requests/purchase-requests.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SetupModule } from './modules/setup/setup.module';
import { StockModule } from './modules/stock/stock.module';
import { UsersModule } from './modules/users/users.module';

/** Em produção a própria API entrega o front-end (mesma origem = cookies mais seguros, sem CORS). */
const webDist = join(__dirname, '..', '..', 'web', 'dist');
const staticFiles = existsSync(webDist)
  ? [ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}'] })]
  : [];

@Module({
  imports: [
    ...staticFiles,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    StockModule,
    PurchaseRequestsModule,
    ReportsModule,
    CustomersModule,
    PaymentMethodsModule,
    PosModule,
    PrintingModule,
    IntegrationModule,
    SetupModule,
  ],
  providers: [
    // A ordem importa: limite de requisições → sessão → permissões → PIN.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: PinGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}

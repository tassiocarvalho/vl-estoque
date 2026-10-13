import { Controller, Get, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';
import { RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { ReportsService } from './reports.service';

class MovementsReportQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.PRODUCT_READ)
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('movements')
  @RequirePermissions(Permission.REPORT_READ)
  movements(@Query() query: MovementsReportQueryDto) {
    return this.reports.movements(query);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

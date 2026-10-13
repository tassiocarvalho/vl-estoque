import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { PaginationQueryDto } from '../../common/pagination';
import { AuditService } from './audit.service';

@Controller('audit')
class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  list(@Query() query: PaginationQueryDto) {
    return this.audit.list(query);
  }
}

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

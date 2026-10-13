import { Body, Controller, Get, Global, Module, Patch } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { toJson } from '../../common/json';
import { AuditService } from '../audit/audit.service';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const updated = await this.settings.update(dto);
    await this.audit.log({
      userId: user.id,
      action: 'settings.update',
      entity: 'settings',
      details: toJson(dto),
      ip,
    });
    return updated;
  }
}

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

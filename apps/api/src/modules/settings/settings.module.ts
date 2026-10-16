import { Body, Controller, Get, Global, Module, Patch } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
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

  /** Nome, logotipo e cores da loja — público porque a tela de login já é personalizada. */
  @Public()
  @Get('branding')
  branding() {
    return this.settings.branding();
  }

  @Patch()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const updated = await this.settings.update(dto);
    // O logotipo é grande demais para a auditoria: registra só que ele mudou.
    const details = dto.store?.logo !== undefined ? { ...dto, store: { ...dto.store, logo: '[imagem]' } } : dto;
    await this.audit.log({
      userId: user.id,
      action: 'settings.update',
      entity: 'settings',
      details: toJson(details),
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

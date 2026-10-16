import { Body, Controller, Get, Global, Injectable, Logger, Module, OnApplicationBootstrap, Put } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { toJson } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { TERMS_VERSION } from './terms';

/** Dados da empresa (controladora, na LGPD) exibidos no termo. */
export interface CompanyInfo {
  name: string;
  cnpj: string;
  address: string;
  /** Encarregado pelo tratamento de dados pessoais (LGPD, art. 41). */
  dpoName: string;
  dpoEmail: string;
}

const COMPANY_KEY = 'company';
const DEFAULT_COMPANY: CompanyInfo = {
  name: 'V&L Mercadinho e Panificadora',
  cnpj: '',
  address: '',
  dpoName: '',
  dpoEmail: '',
};

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class UpdateCompanyDto {
  @Transform(trim) @IsString() @MaxLength(120) name: string;
  @Transform(trim) @IsString() @MaxLength(20) cnpj: string;
  @Transform(trim) @IsString() @MaxLength(200) address: string;
  @Transform(trim) @IsString() @MaxLength(80) dpoName: string;

  @Transform(trim)
  @IsOptional()
  @ValidateIf((dto: UpdateCompanyDto) => dto.dpoEmail !== '')
  @IsEmail({}, { message: 'E-mail do encarregado inválido' })
  dpoEmail: string;
}

@Injectable()
export class LegalService {
  constructor(private readonly settings: SettingsService) {}

  company() {
    return this.settings.getValue(COMPANY_KEY, DEFAULT_COMPANY);
  }

  updateCompany(dto: UpdateCompanyDto) {
    return this.settings.setValue<CompanyInfo>(COMPANY_KEY, { ...dto, dpoEmail: dto.dpoEmail ?? '' });
  }
}

/** Por quanto tempo o IP fica nos registros de auditoria (minimização de dados, LGPD art. 6º, III). */
const AUDIT_IP_RETENTION_DAYS = 365;

/** Rotina de retenção (ao iniciar e todo dia): apaga o que não precisa mais ser guardado. */
@Injectable()
class PrivacyRetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Privacidade');

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.apply().catch((error: unknown) => this.logger.error(`Falha na rotina de retenção: ${String(error)}`));
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async apply() {
    const day = 24 * 60 * 60_000;
    const [codes, ips] = await this.prisma.$transaction([
      // Códigos de recuperação usados ou vencidos há mais de 1 dia.
      this.prisma.passwordReset.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - day) } } }),
      this.prisma.auditLog.updateMany({
        where: { ip: { not: null }, createdAt: { lt: new Date(Date.now() - AUDIT_IP_RETENTION_DAYS * day) } },
        data: { ip: null },
      }),
    ]);
    if (codes.count || ips.count) {
      this.logger.log(`Retenção: ${codes.count} código(s) de recuperação apagados, ${ips.count} IP(s) removidos da auditoria`);
    }
  }
}

@Controller()
class LegalController {
  constructor(
    private readonly legal: LegalService,
    private readonly audit: AuditService,
  ) {}

  /** Público: o termo pode ser lido antes do login. */
  @Public()
  @Get('legal')
  async info() {
    return { termsVersion: TERMS_VERSION, company: await this.legal.company() };
  }

  @Put('settings/company')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async update(@Body() dto: UpdateCompanyDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const company = await this.legal.updateCompany(dto);
    await this.audit.log({ userId: user.id, action: 'settings.company', entity: 'settings', details: toJson(dto), ip });
    return company;
  }
}

@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService, PrivacyRetentionService],
  exports: [LegalService],
})
export class LegalModule {}

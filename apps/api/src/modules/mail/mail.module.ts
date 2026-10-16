import { Body, Controller, Get, Global, HttpCode, Injectable, Logger, Module, Post, Put } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { createTransport } from 'nodemailer';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/security/crypto';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

/** Conta de e-mail usada para enviar os códigos de recuperação de senha (ex.: Gmail com senha de app). */
interface StoredMailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Senha criptografada (AES-256-GCM); nunca sai da API. */
  passwordEncrypted?: string;
  fromName: string;
}

const MAIL_KEY = 'mail';
const DEFAULT_MAIL: StoredMailSettings = { host: '', port: 465, secure: true, user: '', fromName: 'V&L Estoque' };

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class UpdateMailDto {
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  /** true = SSL/TLS direto (porta 465); false = STARTTLS (porta 587). */
  @IsBoolean()
  secure: boolean;

  @Transform(trim)
  @IsEmail({}, { message: 'Informe o e-mail da conta de envio' })
  user: string;

  /** Opcional na edição: em branco, mantém a senha já salva. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 60)
  fromName: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly settings: SettingsService) {}

  private async load() {
    const stored = await this.settings.getValue(MAIL_KEY, DEFAULT_MAIL);
    return { ...stored, password: decryptSecret(stored.passwordEncrypted) };
  }

  /** Configuração para a tela do administrador (sem a senha). */
  async view() {
    const { passwordEncrypted, password, ...rest } = await this.load();
    return { ...rest, hasPassword: Boolean(passwordEncrypted), configured: Boolean(rest.host && rest.user && password) };
  }

  async isConfigured() {
    const config = await this.load();
    return Boolean(config.host && config.user && config.password);
  }

  async update(dto: UpdateMailDto) {
    const current = await this.settings.getValue(MAIL_KEY, DEFAULT_MAIL);
    const { password, ...rest } = dto;
    await this.settings.setValue<StoredMailSettings>(MAIL_KEY, {
      ...rest,
      passwordEncrypted: password ? encryptSecret(password.replace(/\s+/g, '')) : current.passwordEncrypted,
    });
    return this.view();
  }

  async send(message: MailMessage) {
    const config = await this.load();
    if (!config.host || !config.user || !config.password) throw badRequest('O envio de e-mail não está configurado');

    // A senha nunca trafega sem criptografia pela rede; só um servidor no próprio computador dispensa TLS.
    const localServer = ['localhost', '127.0.0.1', '::1'].includes(config.host);
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure && !localServer,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
    try {
      await transport.sendMail({ from: { name: config.fromName, address: config.user }, ...message });
    } finally {
      transport.close();
    }
  }

  /** Envio em segundo plano: a resposta da API não espera (nem revela) o resultado. */
  sendInBackground(message: MailMessage, onError?: (error: unknown) => void) {
    this.send(message).catch((error: unknown) => {
      this.logger.error(`Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`);
      onError?.(error);
    });
  }
}

@Controller('settings/mail')
@RequirePermissions(Permission.SETTINGS_MANAGE)
class MailSettingsController {
  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get() {
    return this.mail.view();
  }

  @Put()
  async update(@Body() dto: UpdateMailDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const view = await this.mail.update(dto);
    await this.audit.log({
      userId: user.id,
      action: 'settings.mail',
      entity: 'settings',
      details: { host: dto.host, user: dto.user, passwordChanged: Boolean(dto.password) },
      ip,
    });
    return view;
  }

  /** Envia um e-mail de teste para o próprio administrador. */
  @Post('test')
  @HttpCode(204)
  async test(@CurrentUser() user: AuthUser) {
    const { email } = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    if (!email) throw badRequest('Cadastre o seu e-mail em “Meu perfil” para receber o teste');
    try {
      await this.mail.send({
        to: email,
        subject: 'Teste de envio — V&L Estoque',
        text: `Olá, ${user.name}!\n\nO envio de e-mails do V&L Estoque está funcionando. A recuperação de senha por e-mail já pode ser usada.`,
      });
    } catch (error) {
      if (error instanceof Error && 'getStatus' in error) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw badRequest(`Não foi possível enviar: ${reason}`);
    }
  }
}

@Global()
@Module({
  controllers: [MailSettingsController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

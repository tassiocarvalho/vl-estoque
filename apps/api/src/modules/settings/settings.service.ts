import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_SETTINGS, NESTED_SETTINGS, SystemSettings } from './settings.types';
import { UpdateSettingsDto } from './settings.dto';

const SETTINGS_KEY = 'system';

/**
 * Remove os campos ausentes. Os DTOs são classes e os campos não enviados existem como `undefined`;
 * sem isso, eles apagariam os valores atuais na mesclagem.
 */
const defined = <T extends object>(value: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Mescla os grupos aninhados campo a campo (um PATCH parcial não apaga o resto do grupo). */
function merge(base: SystemSettings, patch: Partial<SystemSettings>): SystemSettings {
  const next = { ...base, ...defined(patch) } as SystemSettings;
  for (const key of NESTED_SETTINGS) {
    (next as unknown as Record<string, unknown>)[key] = { ...base[key], ...defined(patch[key]) };
  }
  return next;
}

@Injectable()
export class SettingsService {
  private cache?: SystemSettings;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SystemSettings> {
    if (this.cache) return this.cache;

    const row = await this.prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
    this.cache = merge(DEFAULT_SETTINGS, (row?.value ?? {}) as Partial<SystemSettings>);
    return this.cache;
  }

  /** Dados públicos da marca: a tela de login já aparece com o nome e o logotipo do cliente. */
  async branding() {
    const { store } = await this.get();
    return store;
  }

  /** Outras configurações guardadas em chaves próprias (ex.: e-mail, dados da empresa). */
  async getValue<T extends object>(key: string, defaults: T): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return { ...defaults, ...((row?.value ?? {}) as Partial<T>) };
  }

  async setValue<T extends object>(key: string, value: T): Promise<T> {
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
    return value;
  }

  async update(patch: UpdateSettingsDto): Promise<SystemSettings> {
    const next = merge(await this.get(), patch as Partial<SystemSettings>);
    const value = next as unknown as Prisma.InputJsonValue;

    await this.prisma.setting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
    this.cache = next;
    return next;
  }
}

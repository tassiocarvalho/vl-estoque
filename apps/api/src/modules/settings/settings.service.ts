import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_SETTINGS, SystemSettings } from './settings.types';
import { UpdateSettingsDto } from './settings.dto';

const SETTINGS_KEY = 'system';

@Injectable()
export class SettingsService {
  private cache?: SystemSettings;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SystemSettings> {
    if (this.cache) return this.cache;

    const row = await this.prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
    const stored = (row?.value ?? {}) as Partial<SystemSettings>;
    this.cache = {
      ...DEFAULT_SETTINGS,
      ...stored,
      pinRequired: { ...DEFAULT_SETTINGS.pinRequired, ...stored.pinRequired },
    };
    return this.cache;
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
    const current = await this.get();
    const next: SystemSettings = {
      ...current,
      ...patch,
      pinRequired: { ...current.pinRequired, ...patch.pinRequired },
    };
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

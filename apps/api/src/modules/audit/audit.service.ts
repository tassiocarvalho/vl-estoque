import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, PaginationQueryDto, toSkipTake } from '../../common/pagination';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
  ip?: string;
}

/** Registro de quem fez o quê e quando — essencial para investigar diferenças de estoque. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (error) {
      // A auditoria nunca deve derrubar a operação principal.
      this.logger.error(`Falha ao registrar auditoria (${entry.action})`, error as Error);
    }
  }

  async list(query: PaginationQueryDto): Promise<Paginated<unknown>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        ...toSkipTake(query),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, username: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

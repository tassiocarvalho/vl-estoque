import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Prisma, PurchaseRequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { badRequest, conflict, notFound } from '../../common/errors';
import { Paginated, PaginationQueryDto, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const { PENDING, ORDERED, RECEIVED, CANCELED } = PurchaseRequestStatus;

/** Fluxo permitido: Pendente → Pedido feito → Recebido (ou Cancelado em qualquer etapa aberta). */
const ALLOWED_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  PENDING: [ORDERED, CANCELED],
  ORDERED: [RECEIVED, CANCELED],
  RECEIVED: [],
  CANCELED: [],
};

class ListPurchaseRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseRequestStatus)
  status?: PurchaseRequestStatus;
}

class CreatePurchaseRequestDto {
  @IsUUID()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(200)
  note?: string;
}

class UpdateStatusDto {
  @IsEnum(PurchaseRequestStatus)
  status: PurchaseRequestStatus;
}

const requestInclude = {
  product: { select: { id: true, name: true, sku: true, barcode: true, unit: true, currentStock: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseRequestInclude;

type RequestWithRelations = Prisma.PurchaseRequestGetPayload<{ include: typeof requestInclude }>;

const toRequestView = (request: RequestWithRelations) => ({
  ...request,
  suggestedQuantity: toNumber(request.suggestedQuantity),
  stockAtRequest: toNumber(request.stockAtRequest),
  reorderPoint: toNumber(request.reorderPoint),
  product: { ...request.product, currentStock: toNumber(request.product.currentStock) },
  automatic: request.createdById === null,
});

@Injectable()
class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListPurchaseRequestsQueryDto): Promise<Paginated<ReturnType<typeof toRequestView>>> {
    const where: Prisma.PurchaseRequestWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);
    return { items: items.map(toRequestView), total, page: query.page, pageSize: query.pageSize };
  }

  async create(dto: CreatePurchaseRequestDto, actor: AuthUser, ip: string) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw notFound('Produto');

    const open = await this.prisma.purchaseRequest.findFirst({
      where: { productId: product.id, status: { in: [PENDING, ORDERED] } },
    });
    if (open) throw conflict('Já existe uma solicitação em aberto para este produto');

    const request = await this.prisma.purchaseRequest.create({
      data: {
        productId: product.id,
        suggestedQuantity: dto.quantity,
        stockAtRequest: product.currentStock,
        reorderPoint: product.reorderPoint,
        note: dto.note,
        createdById: actor.id,
      },
      include: requestInclude,
    });
    await this.audit.log({ userId: actor.id, action: 'purchase.create', entity: 'purchase', entityId: request.id, ip });
    return toRequestView(request);
  }

  async updateStatus(id: string, status: PurchaseRequestStatus, actor: AuthUser, ip: string) {
    const request = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitação');
    if (!ALLOWED_TRANSITIONS[request.status].includes(status)) {
      throw badRequest('Mudança de situação não permitida para esta solicitação');
    }

    const closed = status === RECEIVED || status === CANCELED;
    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status, closedAt: closed ? new Date() : null },
      include: requestInclude,
    });
    await this.audit.log({
      userId: actor.id,
      action: 'purchase.status',
      entity: 'purchase',
      entityId: id,
      details: { from: request.status, to: status },
      ip,
    });
    return toRequestView(updated);
  }
}

@Controller('purchase-requests')
class PurchaseRequestsController {
  constructor(private readonly requests: PurchaseRequestsService) {}

  @Get()
  @RequirePermissions(Permission.PURCHASE_READ)
  list(@Query() query: ListPurchaseRequestsQueryDto) {
    return this.requests.list(query);
  }

  @Post()
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.requests.create(dto, user, ip);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.PURCHASE_MANAGE)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { status }: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.requests.updateStatus(id, status, user, ip);
  }
}

@Module({
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}

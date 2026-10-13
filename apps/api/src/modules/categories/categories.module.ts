import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;

  /** Preenchido quando for uma subcategoria. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class RenameCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;
}

@Injectable()
class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Categorias com suas subcategorias. */
  list() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { name: 'asc' },
      include: {
        children: { orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } },
        _count: { select: { products: true } },
      },
    });
  }

  async create({ name, parentId }: CreateCategoryDto) {
    if (parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) throw notFound('Categoria');
      if (parent.parentId) throw badRequest('Subcategorias não podem ter outro nível abaixo');
    }
    await this.assertUniqueName(name, parentId ?? null);
    return this.prisma.category.create({ data: { name, parentId } });
  }

  async rename(id: string, { name }: RenameCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw notFound('Categoria');
    await this.assertUniqueName(name, category.parentId, id);
    return this.prisma.category.update({ where: { id }, data: { name } });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw notFound('Categoria');
    if (category._count.children > 0) throw conflict('Remova as subcategorias antes');
    if (category._count.products > 0) throw conflict('Existem produtos nesta categoria (inclusive na lixeira)');
    await this.prisma.category.delete({ where: { id } });
  }

  private async assertUniqueName(name: string, parentId: string | null, exceptId?: string) {
    const duplicate = await this.prisma.category.findFirst({
      where: { parentId, name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined },
    });
    if (duplicate) throw conflict('Já existe uma categoria com esse nome neste nível');
  }
}

@Controller('categories')
class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCT_READ)
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameCategoryDto) {
    return this.categories.rename(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}

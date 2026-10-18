import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import {
  AttachmentDto,
  CreatePayableDto,
  ExpenseCategoryDto,
  ListPayablesQueryDto,
  PayPayableDto,
  UpdateExpenseCategoryDto,
  UpdatePayableDto,
} from './finance.dto';
import { PayablesService } from './payables.service';

class ListCategoriesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}

@Controller('expense-categories')
class ExpenseCategoriesController {
  constructor(private readonly payables: PayablesService) {}

  @Get()
  @RequirePermissions(Permission.FINANCE_READ)
  list(@Query() { all }: ListCategoriesQueryDto) {
    return this.payables.categories(all);
  }

  @Post()
  @RequirePermissions(Permission.FINANCE_MANAGE)
  create(@Body() dto: ExpenseCategoryDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.createCategory(dto, user, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.FINANCE_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseCategoryDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.updateCategory(id, dto, user, ip);
  }
}

@Controller('payables')
class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  @Get()
  @RequirePermissions(Permission.FINANCE_READ)
  list(@Query() query: ListPayablesQueryDto) {
    return this.payables.list(query);
  }

  @Get('summary')
  @RequirePermissions(Permission.FINANCE_READ)
  summary() {
    return this.payables.summary();
  }

  @Get(':id')
  @RequirePermissions(Permission.FINANCE_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payables.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.FINANCE_MANAGE)
  create(@Body() dto: CreatePayableDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.create(dto, user, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.FINANCE_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayableDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.update(id, dto, user, ip);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermissions(Permission.FINANCE_MANAGE)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayableDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.pay(id, dto, user, ip);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermissions(Permission.FINANCE_MANAGE)
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.reopen(id, user, ip);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.FINANCE_MANAGE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.cancel(id, user, ip);
  }

  @Put(':id/attachment')
  @RequirePermissions(Permission.FINANCE_MANAGE)
  attach(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AttachmentDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.attach(id, dto, user, ip);
  }

  @Get(':id/attachment')
  @RequirePermissions(Permission.FINANCE_READ)
  async download(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.payables.attachment(id);
    res.attachment(file.name);
    res.type(file.type);
    return new StreamableFile(file.data);
  }

  @Delete(':id/attachment')
  @RequirePermissions(Permission.FINANCE_MANAGE)
  detach(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.payables.removeAttachment(id, user, ip);
  }
}

@Module({
  controllers: [ExpenseCategoriesController, PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class FinanceModule {}

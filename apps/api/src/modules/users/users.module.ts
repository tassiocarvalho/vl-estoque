import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { CreateUserDto, ResetPasswordDto, ResetPinDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermissions(Permission.USER_MANAGE)
class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.users.create(dto, { id: user.id, ip });
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.users.update(id, dto, { id: user.id, ip });
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.users.resetPassword(id, dto.password, { id: user.id, ip });
  }

  @Post(':id/reset-pin')
  @HttpCode(204)
  resetPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPinDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.users.resetPin(id, dto.pin, { id: user.id, ip });
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

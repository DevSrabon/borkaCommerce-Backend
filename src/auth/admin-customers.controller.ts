import { Controller, Get, Post, Body, UseGuards, Delete, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CreateAdminDto, UpdateCustomerDto } from './dto/auth.dto';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from './current-user.decorator';

@UseGuards(AdminGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = 50;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : (skip ? Math.floor(Math.max(0, parseInt(skip, 10)) / limitNum) + 1 : 1);
    const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : (pageNum - 1) * limitNum;
    const { items, total } = await this.authService.findAllCustomers(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      skip: skipNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    };
  }

  @Post('create-admin')
  createAdmin(@Body() dto: CreateAdminDto, @CurrentUser() currentUser: any) {
    return this.authService.createAdmin(dto, currentUser);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authService.getCustomerDetails(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.authService.updateCustomer(id, dto, currentUser);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.authService.removeCustomer(id, currentUser);
  }
}

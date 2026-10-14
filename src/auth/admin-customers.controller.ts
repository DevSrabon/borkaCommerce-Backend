import { Controller, Get, Post, Body, UseGuards, Delete, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CreateAdminDto, UpdateCustomerDto } from './dto/auth.dto';
import { AdminGuard } from './admin.guard';

@UseGuards(AdminGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async findAll(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const { items, total } = await this.authService.findAllCustomers(limitNum, skipNum);
    if (res) {
      res.setHeader('x-total-count', total.toString());
    }
    return items;
  }

  @Post('create-admin')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.authService.createAdmin(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authService.getCustomerDetails(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.authService.updateCustomer(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authService.removeCustomer(id);
  }
}

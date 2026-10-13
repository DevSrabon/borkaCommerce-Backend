import { Controller, Get, Post, Body, UseGuards, Delete, Param, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAdminDto, UpdateCustomerDto } from './dto/auth.dto';
import { AdminGuard } from './admin.guard';

@UseGuards(AdminGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  findAll() {
    return this.authService.findAllCustomers();
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

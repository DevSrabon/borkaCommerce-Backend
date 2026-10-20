import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@UseGuards(AuthGuard)
@Controller(['ecommerce/customer-addresses', 'ecommerce/addresses'])
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(@CurrentUser() customer: any, @Body() createAddressDto: CreateAddressDto) {
    return this.addressesService.create(customer.id, createAddressDto);
  }



  @Put(':id')
  updatePut(
    @CurrentUser() customer: any,
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.addressesService.update(customer.id, id, updateAddressDto);
  }

  @Get()
  findAll(@CurrentUser() customer: any) {
    return this.addressesService.findByCustomer(customer.id);
  }

  @Get(':id')
  findOne(@CurrentUser() customer: any, @Param('id') id: string) {
    const isAdmin = customer?.role === 'ADMIN';
    return this.addressesService.findOne(customer.id, id, isAdmin);
  }

  @Delete(':id')
  delete(@CurrentUser() customer: any, @Param('id') id: string) {
    return this.addressesService.delete(customer.id, id);
  }

  @Patch(':id/default')
  setDefault(@CurrentUser() customer: any, @Param('id') id: string) {
    return this.addressesService.setDefault(customer.id, id);
  }

   @Patch(':id')
  update(
    @CurrentUser() customer: any,
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.addressesService.update(customer.id, id, updateAddressDto);
  }
}


import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/address.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(AuthGuard)
@Controller('ecommerce/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(@CurrentUser() customer: any, @Body() createAddressDto: CreateAddressDto) {
    return this.addressesService.create(customer.id, createAddressDto);
  }

  @Get()
  findAll(@CurrentUser() customer: any) {
    return this.addressesService.findByCustomer(customer.id);
  }
}

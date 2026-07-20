import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { AuthModule } from '../auth/auth.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, PromotionsModule, ConfigModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

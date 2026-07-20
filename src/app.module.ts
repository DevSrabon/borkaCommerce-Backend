import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { PromotionsModule } from './promotions/promotions.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    PromotionsModule,
    OrdersModule,
    AddressesModule,
    SiteSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

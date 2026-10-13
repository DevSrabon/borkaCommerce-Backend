import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsStorefrontController, ReviewsAdminController } from './reviews.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ReviewsStorefrontController, ReviewsAdminController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

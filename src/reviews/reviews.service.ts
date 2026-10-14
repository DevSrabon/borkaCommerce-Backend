import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';
import { review_status } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async checkPurchaseEligibility(customerId: string, productId: string) {
    // 1. Verify if customer has bought any variant of this product in a valid order
    const purchase = await this.prisma.orders.findFirst({
      where: {
        customer_id: customerId,
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
        items: {
          some: {
            variant: {
              product_id: productId,
            },
          },
        },
      },
    });

    // 2. Check if user already reviewed
    const existing = await this.prisma.reviews.findFirst({
      where: {
        customer_id: customerId,
        product_id: productId,
      },
    });

    return {
      has_purchased: !!purchase,
      can_review: !!purchase,
      existing_review: existing || null,
    };
  }

  async createReview(customerId: string, dto: CreateReviewDto) {
    // Check product exists
    const product = await this.prisma.products.findUnique({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Verify customer purchase
    const eligibility = await this.checkPurchaseEligibility(customerId, dto.product_id);
    if (!eligibility.has_purchased) {
      throw new BadRequestException('Only customers who have purchased this product can leave a review.');
    }

    // Check if review already exists for this user and product
    if (eligibility.existing_review) {
      // Update existing review
      return this.prisma.reviews.update({
        where: { id: eligibility.existing_review.id },
        data: {
          rating: dto.rating,
          review: dto.review || null,
          status: review_status.APPROVED,
        },
        include: {
          customer: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      });
    }

    // Create new review
    return this.prisma.reviews.create({
      data: {
        customer_id: customerId,
        product_id: dto.product_id,
        rating: dto.rating,
        review: dto.review || null,
        status: review_status.APPROVED,
      },
      include: {
        customer: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
  }

  async getProductReviews(productId: string) {
    const reviews = await this.prisma.reviews.findMany({
      where: {
        product_id: productId,
        status: review_status.APPROVED,
      },
      include: {
        customer: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const total = reviews.length;
    const average =
      total > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / total).toFixed(1))
        : 0;

    const distribution = {
      5: reviews.filter((r) => r.rating === 5).length,
      4: reviews.filter((r) => r.rating === 4).length,
      3: reviews.filter((r) => r.rating === 3).length,
      2: reviews.filter((r) => r.rating === 2).length,
      1: reviews.filter((r) => r.rating === 1).length,
    };

    return {
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        status: r.status,
        created_at: r.created_at,
        customer_name: `${r.customer.first_name} ${r.customer.last_name[0] || ''}.`,
        is_verified_buyer: true,
      })),
      stats: {
        total_reviews: total,
        average_rating: average,
        distribution,
      },
    };
  }

  // --- ADMIN METHODS ---

  async getAllReviewsAdmin(status?: review_status, limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;
    const where = status ? { status } : {};

    const [reviews, total] = await Promise.all([
      this.prisma.reviews.findMany({
        where,
        take,
        skip: skipCount,
        include: {
          customer: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.reviews.count({ where }),
    ]);

    return { items: reviews, total };
  }

  async updateReviewStatus(id: string, status: review_status) {
    const review = await this.prisma.reviews.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return this.prisma.reviews.update({
      where: { id },
      data: { status },
      include: {
        customer: { select: { id: true, first_name: true, last_name: true, email: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async deleteReview(id: string) {
    const review = await this.prisma.reviews.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return this.prisma.reviews.delete({
      where: { id },
    });
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { product_status, variant_status, inventory_transaction_type, offer_status, review_status } from '@prisma/client';
import { UploadFilesService } from '../uploads/upload-files.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private uploadFilesService: UploadFilesService,
    private mailService: MailService,
  ) {}

  async create(dto: CreateProductDto) {
    // Validate at least one product image is provided
    if (!dto.images || dto.images.length === 0) {
      throw new BadRequestException('At least one product image is required');
    }

    const existing = await this.prisma.products.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException('Product slug already exists');
    }

    // Run within a transaction to ensure database consistency
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Product
      const product = await tx.products.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          short_description: dto.short_description,
          sku_prefix: dto.sku_prefix,
          video_url: dto.video_url,
          seo_title: dto.seo_title,
          seo_description: dto.seo_description,
          seo_keywords: dto.seo_keywords,
          tags: dto.tags,
          status: dto.status || product_status.DRAFT,
          is_featured: dto.is_featured || false,
          is_cod_allowed: dto.is_cod_allowed !== undefined ? dto.is_cod_allowed : true,
        },
      });

      // 2. Link Categories
      if (dto.category_ids && dto.category_ids.length > 0) {
        // Validate categories exist
        const cats = await tx.categories.findMany({
          where: { id: { in: dto.category_ids } },
        });
        if (cats.length !== dto.category_ids.length) {
          throw new NotFoundException('One or more categories do not exist');
        }

        await tx.product_categories.createMany({
          data: dto.category_ids.map((catId) => ({
            product_id: product.id,
            category_id: catId,
          })),
        });
      }

      // 2b. Link Related Categories
      if (dto.related_category_ids && dto.related_category_ids.length > 0) {
        const relatedCats = await tx.categories.findMany({
          where: { id: { in: dto.related_category_ids } },
        });
        if (relatedCats.length !== dto.related_category_ids.length) {
          throw new NotFoundException('One or more related categories do not exist');
        }

        await tx.product_related_categories.createMany({
          data: dto.related_category_ids.map((catId) => ({
            product_id: product.id,
            category_id: catId,
          })),
        });
      }

      // 3. Add Common Images
      if (dto.images && dto.images.length > 0) {
        await tx.product_images.createMany({
          data: dto.images.map((img) => ({
            product_id: product.id,
            image_url: img.image_url,
            alt_text: img.alt_text,
            is_thumbnail: img.is_thumbnail || false,
            sort_order: img.sort_order || 0,
          })),
        });
      }

      // 4. Create Product Variants
      for (const variantDto of dto.variants) {
        // Check sku uniqueness
        const skuExists = await tx.product_variants.findUnique({
          where: { sku: variantDto.sku },
        });
        if (skuExists) {
          throw new BadRequestException(`SKU ${variantDto.sku} is already in use`);
        }

        const variant = await tx.product_variants.create({
          data: {
            product_id: product.id,
            sku: variantDto.sku,
            barcode: variantDto.barcode,
            weight: variantDto.weight,
            price: variantDto.price,
            compare_price: variantDto.compare_price,
            cost_price: variantDto.cost_price,
            status: variantDto.status || variant_status.ACTIVE,
          },
        });

        // 4a. Handle Variant Attributes (Color, Size, Fabric)
        for (const attrDto of variantDto.attributes || []) {
          // Find or create attribute
          const attribute = await tx.attributes.upsert({
            where: { name: attrDto.name },
            create: { name: attrDto.name },
            update: {},
          });

          // Find or create attribute value
          const attrVal = await tx.attribute_values.upsert({
            where: {
              attribute_id_value: {
                attribute_id: attribute.id,
                value: attrDto.value,
              },
            },
            create: {
              attribute_id: attribute.id,
              value: attrDto.value,
            },
            update: {},
          });

          // Create variant attribute mapping
          await tx.variant_attribute_values.create({
            data: {
              variant_id: variant.id,
              attribute_value_id: attrVal.id,
            },
          });
        }

        // 4b. Add Variant Images
        if (variantDto.images && variantDto.images.length > 0) {
          await tx.variant_images.createMany({
            data: variantDto.images.map((img, idx) => ({
              variant_id: variant.id,
              image: this.variantImageUrl(img),
              alt_text: this.variantImageAltText(img),
              sort_order: idx,
            })),
          });
        }

        // 4c. Set Initial Inventory
        let warehouseId = variantDto.warehouse_id;
        if (!warehouseId) {
          // If no warehouse specified, select the first available warehouse
          const defaultWarehouse = await tx.warehouses.findFirst();
          if (!defaultWarehouse) {
            throw new BadRequestException('No warehouses registered in the system. Create a warehouse first.');
          }
          warehouseId = defaultWarehouse.id;
        }

        await tx.inventory.create({
          data: {
            variant_id: variant.id,
            warehouse_id: warehouseId,
            quantity: variantDto.initial_quantity,
            reserved_quantity: 0,
            available_quantity: variantDto.initial_quantity,
          },
        });

        // 4d. Log Inventory transaction
        await tx.inventory_transactions.create({
          data: {
            variant_id: variant.id,
            warehouse_id: warehouseId,
            type: inventory_transaction_type.PURCHASE,
            quantity: variantDto.initial_quantity,
            reference_type: 'PRODUCT_CREATE',
            reference_id: product.id,
          },
        });
      }

      return product;
    });
  }

  async findAllAdmin() {
    const products = await this.prisma.products.findMany({
      where: { deleted_at: null },
      include: {
        product_categories: {
          include: { category: true },
        },
        related_categories: {
          include: { category: true },
        },
        variants: {
          include: {
            inventories: {
              include: { warehouse: true },
            },
          },
        },
        images: true,
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return products.map((p) => {
      const reviewList = p.reviews || [];
      const reviewCount = reviewList.length;
      const avgRating =
        reviewCount > 0
          ? Number((reviewList.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1))
          : 0;

      return {
        ...p,
        rating: {
          average: avgRating,
          count: reviewCount,
        },
      };
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.products.findFirst({
      where: { id, deleted_at: null },
      include: {
        product_categories: {
          include: { category: true },
        },
        related_categories: {
          include: { category: true },
        },
        images: true,
        variants: {
          include: {
            images: true,
            inventories: true,
            attributes: {
              include: {
                attribute_value: {
                  include: { attribute: true },
                },
              },
            },
          },
        },
        reviews: {
          where: { status: 'APPROVED' },
          include: { customer: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id); // Check existence

    if (dto.images && dto.images.length === 0) {
      throw new BadRequestException('At least one product image is required');
    }

    if (dto.slug) {
      const existing = await this.prisma.products.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException('Product slug already exists');
      }
    }

    const deletedImagePaths: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.products.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          short_description: dto.short_description,
          sku_prefix: dto.sku_prefix,
          video_url: dto.video_url,
          seo_title: dto.seo_title,
          seo_description: dto.seo_description,
          seo_keywords: dto.seo_keywords,
          tags: dto.tags,
          status: dto.status,
          is_featured: dto.is_featured,
          is_cod_allowed: dto.is_cod_allowed,
        },
      });

      if (dto.category_ids) {
        // Delete old category linkages
        await tx.product_categories.deleteMany({ where: { product_id: id } });

        // Add new category linkages
        if (dto.category_ids.length > 0) {
          await tx.product_categories.createMany({
            data: dto.category_ids.map((catId) => ({
              product_id: id,
              category_id: catId,
            })),
          });
        }
      }

      if (dto.related_category_ids) {
        // Delete old related category linkages
        await tx.product_related_categories.deleteMany({ where: { product_id: id } });

        // Add new related category linkages
        if (dto.related_category_ids.length > 0) {
          await tx.product_related_categories.createMany({
            data: dto.related_category_ids.map((catId) => ({
              product_id: id,
              category_id: catId,
            })),
          });
        }
      }

      // Sync images without removing files that are still referenced.
      if (dto.images) {
        const existingIds = new Set(product.images.map((image) => image.id));
        const submittedIds = dto.images.filter((image) => image.id).map((image) => image.id!);
        if (submittedIds.some((imageId) => !existingIds.has(imageId))) {
          throw new BadRequestException('One or more product images do not belong to this product');
        }

        const removed = product.images.filter((image) => !submittedIds.includes(image.id));
        deletedImagePaths.push(...removed.map((image) => image.image_url));
        if (removed.length > 0) {
          await tx.product_images.deleteMany({ where: { id: { in: removed.map((image) => image.id) } } });
        }

        for (const [index, image] of dto.images.entries()) {
          const imageData = {
            image_url: image.image_url,
            alt_text: image.alt_text,
            is_thumbnail: image.is_thumbnail || false,
            sort_order: image.sort_order ?? index,
          };
          if (image.id) {
            await tx.product_images.update({ where: { id: image.id }, data: imageData });
          } else {
            await tx.product_images.create({ data: { product_id: id, ...imageData } });
          }
        }
      }

      // Update/sync Variants if provided
      if (dto.variants) {
        const existingVariantIds = new Set(product.variants.map((variant) => variant.id));
        const submittedVariantIds = dto.variants.filter((variant) => variant.id).map((variant) => variant.id);
        if (submittedVariantIds.some((variantId) => !existingVariantIds.has(variantId))) {
          throw new BadRequestException('One or more variants do not belong to this product');
        }

        const omittedVariantIds = product.variants
          .filter((variant) => !submittedVariantIds.includes(variant.id))
          .map((variant) => variant.id);
        if (omittedVariantIds.length > 0) {
          await tx.product_variants.updateMany({
            where: { id: { in: omittedVariantIds } },
            data: { status: variant_status.INACTIVE },
          });
        }

        for (const varDto of dto.variants) {
          const existingVar = varDto.id
            ? await tx.product_variants.findFirst({ where: { id: varDto.id, product_id: id } })
            : await tx.product_variants.findFirst({ where: { sku: varDto.sku, product_id: id } });

          if (existingVar) {
            const skuConflict = await tx.product_variants.findFirst({
              where: { sku: varDto.sku, id: { not: existingVar.id } },
            });
            if (skuConflict) {
              throw new BadRequestException(`SKU ${varDto.sku} is already in use`);
            }

            // Update existing variant
            await tx.product_variants.update({
              where: { id: existingVar.id },
              data: {
                sku: varDto.sku,
                barcode: varDto.barcode,
                weight: varDto.weight,
                price: varDto.price,
                compare_price: varDto.compare_price,
                cost_price: varDto.cost_price,
                status: varDto.status,
              },
            });

            // Sync variant images if provided
            if (varDto.images) {
              await tx.variant_images.deleteMany({ where: { variant_id: existingVar.id } });
              if (varDto.images.length > 0) {
                await tx.variant_images.createMany({
                  data: varDto.images.map((img: any, idx: number) => ({
                    variant_id: existingVar.id,
                    image: this.variantImageUrl(img),
                    alt_text: this.variantImageAltText(img),
                    sort_order: idx,
                  })),
                });
              }
            }

            // Sync attributes for existing variant
            if (varDto.attributes) {
              // Delete old attributes mapping for this variant
              await tx.variant_attribute_values.deleteMany({ where: { variant_id: existingVar.id } });

              for (const attrDto of varDto.attributes) {
                const attribute = await tx.attributes.upsert({
                  where: { name: attrDto.name },
                  create: { name: attrDto.name },
                  update: {},
                });

                const attrVal = await tx.attribute_values.upsert({
                  where: {
                    attribute_id_value: {
                      attribute_id: attribute.id,
                      value: attrDto.value,
                    },
                  },
                  create: {
                    attribute_id: attribute.id,
                    value: attrDto.value,
                  },
                  update: {},
                });

                await tx.variant_attribute_values.create({
                  data: {
                    variant_id: existingVar.id,
                    attribute_value_id: attrVal.id,
                  },
                });
              }
            }

            // Adjust inventory/quantity
            if (varDto.initial_quantity !== undefined) {
              const defaultWarehouse = await tx.warehouses.findFirst();
              if (defaultWarehouse) {
                await tx.inventory.upsert({
                  where: {
                    variant_id_warehouse_id: {
                      variant_id: existingVar.id,
                      warehouse_id: defaultWarehouse.id,
                    },
                  },
                  create: {
                    variant_id: existingVar.id,
                    warehouse_id: defaultWarehouse.id,
                    quantity: varDto.initial_quantity,
                    reserved_quantity: 0,
                    available_quantity: varDto.initial_quantity,
                  },
                  update: {
                    quantity: varDto.initial_quantity,
                    available_quantity: varDto.initial_quantity,
                  },
                });
              }
            }
          } else {
            // Create new variant
            const newVar = await tx.product_variants.create({
              data: {
                product_id: id,
                sku: varDto.sku,
                barcode: varDto.barcode,
                weight: varDto.weight,
                price: varDto.price,
                compare_price: varDto.compare_price,
                cost_price: varDto.cost_price,
                status: varDto.status || variant_status.ACTIVE,
              },
            });

            // Create attribute mappings for the new variant
            if (varDto.attributes) {
              for (const attrDto of varDto.attributes) {
                const attribute = await tx.attributes.upsert({
                  where: { name: attrDto.name },
                  create: { name: attrDto.name },
                  update: {},
                });

                const attrVal = await tx.attribute_values.upsert({
                  where: {
                    attribute_id_value: {
                      attribute_id: attribute.id,
                      value: attrDto.value,
                    },
                  },
                  create: {
                    attribute_id: attribute.id,
                    value: attrDto.value,
                  },
                  update: {},
                });

                await tx.variant_attribute_values.create({
                  data: {
                    variant_id: newVar.id,
                    attribute_value_id: attrVal.id,
                  },
                });
              }
            }

            // Set stock
            let warehouseId = varDto.warehouse_id;
            if (!warehouseId) {
              const defaultWarehouse = await tx.warehouses.findFirst();
              if (defaultWarehouse) {
                warehouseId = defaultWarehouse.id;
              }
            }
            if (warehouseId) {
              await tx.inventory.create({
                data: {
                  variant_id: newVar.id,
                  warehouse_id: warehouseId,
                  quantity: varDto.initial_quantity || 0,
                  available_quantity: varDto.initial_quantity || 0,
                },
              });
            }

            if (varDto.images && varDto.images.length > 0) {
              await tx.variant_images.createMany({
                data: varDto.images.map((img: any, idx: number) => ({
                  variant_id: newVar.id,
                  image: this.variantImageUrl(img),
                  alt_text: this.variantImageAltText(img),
                  sort_order: idx,
                })),
              });
            }
          }
        }
      }

      return updated;
    });

    await Promise.all(deletedImagePaths.map((imageUrl) => this.removeUploadedProductImage(imageUrl)));

    if (dto.notify_customers && updated) {
      try {
        await this.mailService.sendProductStatusUpdateEmail(
          updated.name,
          dto.status || updated.status,
        );
      } catch (err: any) {
        // non-blocking
      }
    }

    return updated;
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.product_images.findFirst({
      where: { id: imageId, product_id: productId },
    });
    if (!image) throw new NotFoundException('Product image not found');

    const imageCount = await this.prisma.product_images.count({ where: { product_id: productId } });
    if (imageCount <= 1) throw new BadRequestException('A product must have at least one image');

    await this.prisma.product_images.delete({ where: { id: imageId } });
    await this.removeUploadedProductImage(image.image_url);
    return { id: imageId, deleted: true };
  }

  private async removeUploadedProductImage(imageUrl: string) {
    const marker = '/uploads/product/';
    const markerIndex = imageUrl.indexOf(marker);
    if (markerIndex === -1) return;
    await this.uploadFilesService.remove(imageUrl.slice(markerIndex + '/uploads'.length), 'product');
  }

  private variantImageUrl(image: string | { image_url?: string; image?: string }) {
    return typeof image === 'string' ? image : image.image_url || image.image || '';
  }

  private variantImageAltText(image: string | { alt_text?: string }) {
    return typeof image === 'string' ? undefined : image.alt_text;
  }

  async remove(id: string) {
    await this.findOne(id); // check existence
    // Perform soft delete
    return this.prisma.products.update({
      where: { id },
      data: { deleted_at: new Date(), status: product_status.ARCHIVED },
    });
  }

  // --- ADMIN ATTRIBUTE METHODS ---

  async findAllAttributes() {
    return this.prisma.attributes.findMany({
      include: {
        values: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async createAttribute(name: string) {
    const existing = await this.prisma.attributes.findUnique({
      where: { name },
    });
    if (existing) {
      throw new BadRequestException(`Attribute with name "${name}" already exists`);
    }
    return this.prisma.attributes.create({
      data: { name },
    });
  }

  async createAttributeValue(attributeId: string, value: string) {
    const attribute = await this.prisma.attributes.findUnique({
      where: { id: attributeId },
    });
    if (!attribute) {
      throw new NotFoundException(`Attribute with ID "${attributeId}" not found`);
    }

    const existingValue = await this.prisma.attribute_values.findUnique({
      where: {
        attribute_id_value: {
          attribute_id: attributeId,
          value,
        },
      },
    });
    if (existingValue) {
      throw new BadRequestException(`Value "${value}" already exists for attribute "${attribute.name}"`);
    }

    return this.prisma.attribute_values.create({
      data: {
        attribute_id: attributeId,
        value,
      },
    });
  }

  async removeAttribute(id: string) {
    const attribute = await this.prisma.attributes.findUnique({
      where: { id },
    });
    if (!attribute) {
      throw new NotFoundException(`Attribute with ID "${id}" not found`);
    }

    return this.prisma.attributes.delete({
      where: { id },
    });
  }

  async removeAttributeValue(valueId: string) {
    const value = await this.prisma.attribute_values.findUnique({
      where: { id: valueId },
    });
    if (!value) {
      throw new NotFoundException(`Attribute value with ID "${valueId}" not found`);
    }

    return this.prisma.attribute_values.delete({
      where: { id: valueId },
    });
  }

  async updateAttribute(id: string, name: string) {
    const attribute = await this.prisma.attributes.findUnique({
      where: { id },
    });
    if (!attribute) {
      throw new NotFoundException(`Attribute with ID "${id}" not found`);
    }

    // Check name uniqueness (excluding self)
    const duplicate = await this.prisma.attributes.findFirst({
      where: { name, id: { not: id } },
    });
    if (duplicate) {
      throw new BadRequestException(`Attribute with name "${name}" already exists`);
    }

    return this.prisma.attributes.update({
      where: { id },
      data: { name },
      include: { values: true },
    });
  }

  async updateAttributeValue(valueId: string, value: string) {
    const existing = await this.prisma.attribute_values.findUnique({
      where: { id: valueId },
    });
    if (!existing) {
      throw new NotFoundException(`Attribute value with ID "${valueId}" not found`);
    }

    // Check uniqueness within same attribute
    const duplicate = await this.prisma.attribute_values.findFirst({
      where: { attribute_id: existing.attribute_id, value, id: { not: valueId } },
    });
    if (duplicate) {
      throw new BadRequestException(`Value "${value}" already exists for this attribute`);
    }

    return this.prisma.attribute_values.update({
      where: { id: valueId },
      data: { value },
    });
  }


  // --- STOREFRONT METHODS ---

  async findAllStorefront(categoryId?: string, isFeatured?: boolean, search?: string, onSale?: boolean) {
    const whereClause: any = {
      status: product_status.PUBLISHED,
      deleted_at: null,
    };

    if (isFeatured !== undefined) {
      whereClause.is_featured = isFeatured;
    }

    if (categoryId) {
      whereClause.product_categories = {
        some: { category_id: categoryId },
      };
    }

    if (search) {
      // PostgreSQL full text or basic search
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { seo_keywords: { contains: search, mode: 'insensitive' } },
        { tags: { contains: search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.products.findMany({
      where: whereClause,
      include: {
        product_categories: {
          include: { category: true },
        },
        images: {
          orderBy: { sort_order: 'asc' },
        },
        variants: {
          where: { status: variant_status.ACTIVE },
          include: {
            images: { orderBy: { sort_order: 'asc' } },
            inventories: true,
            attributes: {
              include: {
                attribute_value: {
                  include: { attribute: true },
                },
              },
            },
            offers: {
              include: {
                offer: true,
              },
            },
          },
        },
      },
      orderBy: { published_at: 'desc' },
    });

    const now = new Date();

    const activeCategoryOffers = await this.prisma.offers.findMany({
      where: {
        status: offer_status.ACTIVE,
        start_date: { lte: now },
        end_date: { gte: now },
        categories: { some: {} },
      },
      include: {
        categories: true,
      },
    });

    // Map each product to append dynamic pricing based on active offers
    const mappedProducts = products.map((prod) => {
      const productCategoryIds = prod.product_categories.map((pc) => pc.category_id);
      const activeCatOffersForProduct = activeCategoryOffers.filter((offer) =>
        offer.categories.some((oc) => productCategoryIds.includes(oc.category_id))
      );

      const mappedVariants = prod.variants.map((v) => {
        // Find active offers for this variant
        const activeOffers = v.offers
          .map((op) => op.offer)
          .filter(
            (o) =>
              o.status === offer_status.ACTIVE &&
              new Date(o.start_date) <= now &&
              new Date(o.end_date) >= now,
          );

        const allActiveOffers = [...activeOffers, ...activeCatOffersForProduct];
        allActiveOffers.sort((a, b) => b.priority - a.priority);

        const basePrice = Number(v.price);
        const baseComparePrice = v.compare_price ? Number(v.compare_price) : null;
        const priceUsd = basePrice / 3.67;
        const priceGbp = basePrice / 4.70;
        const comparePriceUsd = baseComparePrice ? baseComparePrice / 3.67 : null;
        const comparePriceGbp = baseComparePrice ? baseComparePrice / 4.70 : null;

        let offerApplied: any = null;
        let finalPrice = basePrice;
        let finalPriceUsd = priceUsd;
        let finalPriceGbp = priceGbp;

        if (allActiveOffers.length > 0) {
          const topOffer = allActiveOffers[0];
          offerApplied = {
            id: topOffer.id,
            name: topOffer.name,
            type: topOffer.type,
            discount_type: topOffer.discount_type,
            discount_value: Number(topOffer.discount_value),
            end_date: topOffer.end_date, // Expose end_date for countdown timer
          };

          // Compute discounted price
          if (topOffer.discount_type === 'PERCENTAGE') {
            finalPrice = finalPrice * (1 - Number(topOffer.discount_value) / 100);
            finalPriceUsd = finalPriceUsd * (1 - Number(topOffer.discount_value) / 100);
            finalPriceGbp = finalPriceGbp * (1 - Number(topOffer.discount_value) / 100);
          } else {
            finalPrice = Math.max(0, finalPrice - Number(topOffer.discount_value));
            finalPriceUsd = Math.max(0, finalPriceUsd - Number(topOffer.discount_value) / 3.67);
            finalPriceGbp = Math.max(0, finalPriceGbp - Number(topOffer.discount_value) / 4.70);
          }
        }

        // Available quantity is sum of all warehouse inventory available
        const totalAvailable = v.inventories.reduce((acc, inv) => acc + inv.available_quantity, 0);

        return {
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          weight: v.weight,
          price: basePrice,
          price_usd: Number(priceUsd.toFixed(2)),
          price_gbp: Number(priceGbp.toFixed(2)),
          compare_price: baseComparePrice,
          compare_price_usd: comparePriceUsd ? Number(comparePriceUsd.toFixed(2)) : null,
          compare_price_gbp: comparePriceGbp ? Number(comparePriceGbp.toFixed(2)) : null,
          available_stock: totalAvailable,
          images: v.images.map((img) => img.image),
          image_objects: v.images.map((img) => ({ image_url: img.image, alt_text: (img as any).alt_text })),
          attributes: v.attributes.map((av) => ({
            name: av.attribute_value.attribute.name,
            value: av.attribute_value.value,
          })),
          offer: offerApplied,
          discounted_price: Number(finalPrice.toFixed(2)),
          discounted_price_usd: Number(finalPriceUsd.toFixed(2)),
          discounted_price_gbp: Number(finalPriceGbp.toFixed(2)),
        };
      });

      // Find the min price across variants to show a "From AED XXX" label
      const prices = mappedVariants.map((v) => v.discounted_price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const originalPrices = mappedVariants.map((v) => v.price);
      const minOriginalPrice = originalPrices.length > 0 ? Math.min(...originalPrices) : 0;
      const isDiscounted = minOriginalPrice > minPrice;
      const discountPercentage = isDiscounted
        ? Math.round(((minOriginalPrice - minPrice) / minOriginalPrice) * 100)
        : 0;

      const activeOffer = mappedVariants.find((v) => v.offer)?.offer?.name || null;

      return {
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        short_description: prod.short_description,
        is_featured: prod.is_featured,
        thumbnail: prod.images.find((img) => img.is_thumbnail)?.image_url || prod.images[0]?.image_url || null,
        images: prod.images.map((img) => img.image_url),
        image_objects: prod.images.map((img) => ({ image_url: img.image_url, alt_text: (img as any).alt_text })),
        categories: prod.product_categories.map((pc) => ({ id: pc.category.id, name: pc.category.name, slug: pc.category.slug })),
        min_price: minPrice,
        min_original_price: minOriginalPrice,
        on_sale: isDiscounted,
        discount_percentage: discountPercentage,
        active_offer_name: activeOffer,
        variants: mappedVariants,
      };
    });

    if (onSale) {
      return mappedProducts.filter((p) => p.on_sale);
    }

    return mappedProducts;
  }

  async findOneStorefront(slug: string) {
    const product = await this.prisma.products.findFirst({
      where: { slug, status: product_status.PUBLISHED, deleted_at: null },
      include: {
        product_categories: {
          include: { category: true },
        },
        related_categories: {
          include: { category: true },
        },
        images: {
          orderBy: { sort_order: 'asc' },
        },
        variants: {
          where: { status: variant_status.ACTIVE },
          include: {
            images: { orderBy: { sort_order: 'asc' } },
            inventories: true,
            attributes: {
              include: {
                attribute_value: {
                  include: { attribute: true },
                },
              },
            },
            offers: {
              include: { offer: true },
            },
          },
        },
        reviews: {
          where: { status: 'APPROVED' },
          include: {
            customer: {
              select: { first_name: true, last_name: true },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const now = new Date();

    const activeCategoryOffers = await this.prisma.offers.findMany({
      where: {
        status: offer_status.ACTIVE,
        start_date: { lte: now },
        end_date: { gte: now },
        categories: { some: {} },
      },
      include: {
        categories: true,
      },
    });

    const productCategoryIds = product.product_categories.map((pc) => pc.category_id);
    const activeCatOffersForProduct = activeCategoryOffers.filter((offer) =>
      offer.categories.some((oc) => productCategoryIds.includes(oc.category_id))
    );

    // Map single product details and variants
    const mappedVariants = product.variants.map((v) => {
      const activeOffers = v.offers
        .map((op) => op.offer)
        .filter(
          (o) =>
            o.status === offer_status.ACTIVE &&
            new Date(o.start_date) <= now &&
            new Date(o.end_date) >= now,
        );

      const allActiveOffers = [...activeOffers, ...activeCatOffersForProduct];
      allActiveOffers.sort((a, b) => b.priority - a.priority);

      const basePrice = Number(v.price);
      const baseComparePrice = v.compare_price ? Number(v.compare_price) : null;
      const priceUsd = basePrice / 3.67;
      const priceGbp = basePrice / 4.70;
      const comparePriceUsd = baseComparePrice ? baseComparePrice / 3.67 : null;
      const comparePriceGbp = baseComparePrice ? baseComparePrice / 4.70 : null;

      let offerApplied: any = null;
      let finalPrice = basePrice;
      let finalPriceUsd = priceUsd;
      let finalPriceGbp = priceGbp;

      if (allActiveOffers.length > 0) {
        const topOffer = allActiveOffers[0];
        offerApplied = {
          id: topOffer.id,
          name: topOffer.name,
          type: topOffer.type,
          discount_type: topOffer.discount_type,
          discount_value: Number(topOffer.discount_value),
          end_date: topOffer.end_date, // Expose end_date for countdown timer
        };

        if (topOffer.discount_type === 'PERCENTAGE') {
          finalPrice = finalPrice * (1 - Number(topOffer.discount_value) / 100);
          finalPriceUsd = finalPriceUsd * (1 - Number(topOffer.discount_value) / 100);
          finalPriceGbp = finalPriceGbp * (1 - Number(topOffer.discount_value) / 100);
        } else {
          finalPrice = Math.max(0, finalPrice - Number(topOffer.discount_value));
          finalPriceUsd = Math.max(0, finalPriceUsd - Number(topOffer.discount_value) / 3.67);
          finalPriceGbp = Math.max(0, finalPriceGbp - Number(topOffer.discount_value) / 4.70);
        }
      }

      const totalAvailable = v.inventories.reduce((acc, inv) => acc + inv.available_quantity, 0);

      return {
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        weight: v.weight,
        price: basePrice,
        price_usd: Number(priceUsd.toFixed(2)),
        price_gbp: Number(priceGbp.toFixed(2)),
        compare_price: baseComparePrice,
        compare_price_usd: comparePriceUsd ? Number(comparePriceUsd.toFixed(2)) : null,
        compare_price_gbp: comparePriceGbp ? Number(comparePriceGbp.toFixed(2)) : null,
        available_stock: totalAvailable,
        images: v.images.map((img) => img.image),
        image_objects: v.images.map((img) => ({ image_url: img.image, alt_text: (img as any).alt_text })),
        attributes: v.attributes.map((av) => ({
          name: av.attribute_value.attribute.name,
          value: av.attribute_value.value,
        })),
        offer: offerApplied,
        discounted_price: Number(finalPrice.toFixed(2)),
        discounted_price_usd: Number(finalPriceUsd.toFixed(2)),
        discounted_price_gbp: Number(finalPriceGbp.toFixed(2)),
      };
    });

    // Fetch related products:
    // 1. Explicit related categories from product_related_categories
    // 2. Product's own categories (product_categories)
    // 3. Fallback to other published products so related products are always available
    const explicitRelatedCategoryIds = product.related_categories.map((rc) => rc.category_id);
    const ownCategoryIds = product.product_categories.map((pc) => pc.category_id);
    const targetCategoryIds = Array.from(new Set([...explicitRelatedCategoryIds, ...ownCategoryIds]));

    const relatedInclude = {
      product_categories: { include: { category: true } },
      images: { orderBy: { sort_order: 'asc' as const } },
      variants: {
        where: { status: variant_status.ACTIVE },
        include: {
          images: { orderBy: { sort_order: 'asc' as const } },
          inventories: true,
          attributes: { include: { attribute_value: { include: { attribute: true } } } },
          offers: { include: { offer: true } },
        },
      },
      reviews: {
        where: { status: review_status.APPROVED },
        select: { rating: true },
      },
    };

    let rawRelated: any[] = [];
    if (targetCategoryIds.length > 0) {
      rawRelated = await this.prisma.products.findMany({
        where: {
          id: { not: product.id },
          deleted_at: null,
          status: product_status.PUBLISHED,
          product_categories: {
            some: { category_id: { in: targetCategoryIds } },
          },
        },
        include: relatedInclude,
        orderBy: [{ is_featured: 'desc' }, { created_at: 'desc' }],
        take: 8,
      });
    }

    if (rawRelated.length < 4) {
      const existingIds = [product.id, ...rawRelated.map((p) => p.id)];
      const backfill = await this.prisma.products.findMany({
        where: {
          id: { notIn: existingIds },
          deleted_at: null,
          status: product_status.PUBLISHED,
        },
        include: relatedInclude,
        orderBy: [{ is_featured: 'desc' }, { created_at: 'desc' }],
        take: 8 - rawRelated.length,
      });
      rawRelated = [...rawRelated, ...backfill];
    }

    const relatedProducts = rawRelated.map((prod) => {
      const prodCatIds = prod.product_categories.map((pc) => pc.category_id);
      const prodCatOffers = activeCategoryOffers.filter((offer) =>
        offer.categories.some((oc) => prodCatIds.includes(oc.category_id))
      );

      const mappedVars = prod.variants.map((v) => {
        const activeOffers = v.offers
          .map((op) => op.offer)
          .filter(
            (o) =>
              o.status === offer_status.ACTIVE &&
              new Date(o.start_date) <= now &&
              new Date(o.end_date) >= now,
          );

        const allActive = [...activeOffers, ...prodCatOffers];
        allActive.sort((a, b) => b.priority - a.priority);

        const basePrice = Number(v.price);
        const baseComparePrice = v.compare_price ? Number(v.compare_price) : null;
        const priceUsd = basePrice / 3.67;
        const priceGbp = basePrice / 4.70;
        const comparePriceUsd = baseComparePrice ? baseComparePrice / 3.67 : null;
        const comparePriceGbp = baseComparePrice ? baseComparePrice / 4.70 : null;

        let offerApplied: any = null;
        let finalPrice = basePrice;
        let finalPriceUsd = priceUsd;
        let finalPriceGbp = priceGbp;

        if (allActive.length > 0) {
          const topOffer = allActive[0];
          offerApplied = {
            id: topOffer.id,
            name: topOffer.name,
            type: topOffer.type,
            discount_type: topOffer.discount_type,
            discount_value: Number(topOffer.discount_value),
            end_date: topOffer.end_date,
          };

          if (topOffer.discount_type === 'PERCENTAGE') {
            finalPrice = finalPrice * (1 - Number(topOffer.discount_value) / 100);
            finalPriceUsd = finalPriceUsd * (1 - Number(topOffer.discount_value) / 100);
            finalPriceGbp = finalPriceGbp * (1 - Number(topOffer.discount_value) / 100);
          } else {
            finalPrice = Math.max(0, finalPrice - Number(topOffer.discount_value));
            finalPriceUsd = Math.max(0, finalPriceUsd - Number(topOffer.discount_value) / 3.67);
            finalPriceGbp = Math.max(0, finalPriceGbp - Number(topOffer.discount_value) / 4.70);
          }
        }

        const totalAvailable = v.inventories.reduce((acc, inv) => acc + inv.available_quantity, 0);

        return {
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          weight: v.weight,
          price: basePrice,
          price_usd: Number(priceUsd.toFixed(2)),
          price_gbp: Number(priceGbp.toFixed(2)),
          compare_price: baseComparePrice,
          compare_price_usd: comparePriceUsd ? Number(comparePriceUsd.toFixed(2)) : null,
          compare_price_gbp: comparePriceGbp ? Number(comparePriceGbp.toFixed(2)) : null,
          available_stock: totalAvailable,
          images: v.images.map((img) => img.image),
          attributes: v.attributes.map((av) => ({
            name: av.attribute_value.attribute.name,
            value: av.attribute_value.value,
          })),
          offer: offerApplied,
          discounted_price: Number(finalPrice.toFixed(2)),
          discounted_price_usd: Number(finalPriceUsd.toFixed(2)),
          discounted_price_gbp: Number(finalPriceGbp.toFixed(2)),
        };
      });

      const prices = mappedVars.map((v) => v.discounted_price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const originalPrices = mappedVars.map((v) => v.price);
      const minOriginalPrice = originalPrices.length > 0 ? Math.min(...originalPrices) : 0;

      const avgRating = prod.reviews && prod.reviews.length > 0
        ? Number((prod.reviews.reduce((acc, r) => acc + r.rating, 0) / prod.reviews.length).toFixed(1))
        : 0;

      return {
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        short_description: prod.short_description,
        is_featured: prod.is_featured,
        thumbnail: prod.images.find((img) => img.is_thumbnail)?.image_url || prod.images[0]?.image_url || null,
        images: prod.images.map((img) => img.image_url),
        categories: prod.product_categories.map((pc) => ({ id: pc.category.id, name: pc.category.name, slug: pc.category.slug })),
        min_price: minPrice,
        min_original_price: minOriginalPrice,
        average_rating: avgRating,
        review_count: prod.reviews?.length || 0,
        variants: mappedVars,
      };
    });

    // Calculate average rating
    const averageRating = product.reviews.length > 0
      ? Number((product.reviews.reduce((acc, rev) => acc + rev.rating, 0) / product.reviews.length).toFixed(1))
      : 0;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      short_description: product.short_description,
      video_url: product.video_url,
      seo_title: product.seo_title,
      seo_description: product.seo_description,
      seo_keywords: product.seo_keywords,
      tags: product.tags,
      thumbnail: product.images.find((img) => img.is_thumbnail)?.image_url || product.images[0]?.image_url || null,
      images: product.images.map((img) => img.image_url),
      image_objects: product.images.map((img) => ({ image_url: img.image_url, alt_text: (img as any).alt_text })),
      categories: product.product_categories.map((pc) => ({ id: pc.category.id, name: pc.category.name, slug: pc.category.slug })),
      related_categories: product.related_categories.map((rc) => ({ id: rc.category.id, name: rc.category.name, slug: rc.category.slug })),
      variants: mappedVariants,
      related_products: relatedProducts,
      reviews: product.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        created_at: r.created_at,
        customer_name: `${r.customer.first_name} ${r.customer.last_name.substring(0, 1)}.`,
      })),
      rating: {
        average: averageRating,
        count: product.reviews.length,
      },
    };
  }
}


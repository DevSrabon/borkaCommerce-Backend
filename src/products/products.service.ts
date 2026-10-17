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

    // Generate or validate sequential product number (e.g. P1000)
    let productNumber = dto.product_number?.trim();
    if (!productNumber) {
      productNumber = await this.generateNextProductNumber();
    } else {
      const existingProductNumber = await this.prisma.products.findUnique({
        where: { product_number: productNumber },
      });
      if (existingProductNumber) {
        throw new BadRequestException(`Product number "${productNumber}" is already in use`);
      }
    }

    // Run within a transaction to ensure database consistency
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Product
      const product = await tx.products.create({
        data: {
          product_number: productNumber,
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

  async findAllAdmin(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [products, total] = await Promise.all([
      this.prisma.products.findMany({
        where: { deleted_at: null },
        take,
        skip: skipCount,
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
      }),
      this.prisma.products.count({
        where: { deleted_at: null },
      }),
    ]);

    const items = products.map((p) => {
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

    return { items, total };
  }

  async findOne(id: string) {
    const product = await this.prisma.products.findFirst({
      where: {
        OR: [
          { id },
          { slug: id },
          { product_number: id },
        ],
        deleted_at: null,
      },
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
          product_number: dto.product_number !== undefined ? dto.product_number : undefined,
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

  async findAllAttributes(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.attributes.findMany({
        take,
        skip: skipCount,
        include: {
          values: true,
        },
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.attributes.count(),
    ]);

    return { items, total };
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

  async findAllStorefront(
    categoryId?: string,
    isFeatured?: boolean,
    search?: string,
    onSale?: boolean,
    pageNum?: number,
    limitNum?: number,
  ) {
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
        { product_number: { contains: search, mode: 'insensitive' } },
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

    const [activeCategoryOffers, activeGlobalOffers] = await Promise.all([
      this.prisma.offers.findMany({
        where: {
          status: offer_status.ACTIVE,
          start_date: { lte: now },
          end_date: { gte: now },
          categories: { some: {} },
        },
        include: {
          categories: true,
        },
      }),
      this.prisma.offers.findMany({
        where: {
          status: offer_status.ACTIVE,
          start_date: { lte: now },
          end_date: { gte: now },
          categories: { none: {} },
          products: { none: {} },
        },
      }),
    ]);

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

        const allActiveOffers = [...activeOffers, ...activeCatOffersForProduct, ...activeGlobalOffers];
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
        product_number: prod.product_number,
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

    const finalResult = onSale ? mappedProducts.filter((p) => p.on_sale) : mappedProducts;

    if (pageNum !== undefined && limitNum !== undefined && limitNum > 0) {
      const start = (pageNum - 1) * limitNum;
      return finalResult.slice(start, start + limitNum);
    }

    return finalResult;
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

    const [activeCategoryOffers, activeGlobalOffers] = await Promise.all([
      this.prisma.offers.findMany({
        where: {
          status: offer_status.ACTIVE,
          start_date: { lte: now },
          end_date: { gte: now },
          categories: { some: {} },
        },
        include: {
          categories: true,
        },
      }),
      this.prisma.offers.findMany({
        where: {
          status: offer_status.ACTIVE,
          start_date: { lte: now },
          end_date: { gte: now },
          categories: { none: {} },
          products: { none: {} },
        },
      }),
    ]);

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

      const allActiveOffers = [...activeOffers, ...activeCatOffersForProduct, ...activeGlobalOffers];
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
      product_number: product.product_number,
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

  /**
   * Generates sequential product number like P1000, P1001, etc.
   */
  async generateNextProductNumber(client?: any): Promise<string> {
    const db = client || this.prisma;
    const rows = await db.products.findMany({
      where: {
        product_number: {
          not: null,
        },
      },
      select: {
        product_number: true,
      },
    });

    let maxNum = 999;
    for (const r of rows) {
      if (!r.product_number) continue;
      const match = r.product_number.match(/^P-?(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `P${maxNum + 1}`;
  }

  /**
   * Seed realistic dummy abaya products (e.g. 50, 100, 200 items)
   */
  async seedDummyProducts(requestedCount = 50) {
    const count = Math.min(Math.max(1, Number(requestedCount) || 50), 500);

    // 1. Categories
    const categories = await this.prisma.categories.findMany({ select: { id: true, name: true } });

    // 2. Sample Image Pool from migrated database
    const imageRows = await this.prisma.product_images.findMany({
      take: 60,
      select: { image_url: true },
    });
    const imagePool = imageRows.length > 0
      ? imageRows.map((r) => r.image_url)
      : [
          'https://media.sabaalwadi.com/saba-media/product/1791910603708-360341774.png',
          'https://media.sabaalwadi.com/saba-media/product/1791910603710-534125867.png',
          'https://media.sabaalwadi.com/saba-media/product/1791910603710-850785002.png',
        ];

    // 3. Default Warehouse
    let warehouse = await this.prisma.warehouses.findFirst();
    if (!warehouse) {
      warehouse = await this.prisma.warehouses.create({
        data: { name: 'Main Dubai Warehouse', location: 'Dubai, UAE' },
      });
    }

    // 4. Ensure Size attribute and values exist
    const sizeAttr = await this.prisma.attributes.upsert({
      where: { name: 'Size' },
      create: { name: 'Size' },
      update: {},
    });

    const sizes = ['52', '54', '56', '58'];
    const sizeValueMap: Record<string, string> = {};
    for (const size of sizes) {
      const val = await this.prisma.attribute_values.upsert({
        where: {
          attribute_id_value: { attribute_id: sizeAttr.id, value: size },
        },
        create: { attribute_id: sizeAttr.id, value: size },
        update: {},
      });
      sizeValueMap[size] = val.id;
    }

    // 5. Get current max product number
    const rows = await this.prisma.products.findMany({
      where: { product_number: { not: null } },
      select: { product_number: true },
    });
    let maxNum = 1000;
    for (const r of rows) {
      if (!r.product_number) continue;
      const match = r.product_number.match(/^P-?(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }

    const adjectives = [
      'Royal', 'Luxe Dubai', 'Hand-Embroidered', 'Silk Crepe', 'Pearl Embellished',
      'Classic Noir', 'Moroccan Flare', 'Velvet Trim', 'Pastel Blossom', 'Golden Thread',
      'Midnight Lace', 'Ethereal Tiered', 'Organza Sheer', 'Modest Opulence', 'Arabian Glamour'
    ];
    const styles = [
      'Nidha Abaya', 'Open Front Kimono', 'Kaftan Gown', 'Butterfly Cut Abaya',
      'Double Layer Abaya', 'Formal Bisht', 'Pleated Dubai Abaya', 'Satin Wrap Abaya',
      'Cascading Cape Abaya'
    ];
    const colors = [
      'Midnight Black', 'Dusty Lavender', 'Royal Navy', 'Emerald Green',
      'Champagne Beige', 'Burgundy Wine', 'Muted Sage', 'Rose Quartz', 'Desert Sand'
    ];

    const seededProductIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const adj = adjectives[i % adjectives.length];
      const style = styles[(i + 3) % styles.length];
      const col = colors[(i + 5) % colors.length];
      const name = `${adj} ${style} - ${col}`;
      const productNumber = `P${maxNum + i + 1}`;
      const uniqueSuffix = `${Date.now().toString(36)}-${i + 1}-${Math.random().toString(36).substring(2, 6)}`;
      const slug = `dummy-abaya-${uniqueSuffix}`;

      // 2-3 images
      const img1 = imagePool[i % imagePool.length];
      const img2 = imagePool[(i + 2) % imagePool.length];
      const img3 = imagePool[(i + 5) % imagePool.length];
      const assignedImages = [img1, img2, img3].filter(Boolean);

      // Random price between 190 and 650 AED
      const basePrice = 190 + ((i * 17) % 46) * 10;
      const comparePrice = basePrice + 70 + ((i * 11) % 15) * 10;

      // Random 1-2 categories
      const chosenCatIds = categories.length > 0
        ? [categories[i % categories.length].id]
        : [];
      if (categories.length > 1 && (i % 2 === 0)) {
        const secondCat = categories[(i + 1) % categories.length].id;
        if (!chosenCatIds.includes(secondCat)) chosenCatIds.push(secondCat);
      }

      // Create Product
      const product = await this.prisma.products.create({
        data: {
          product_number: productNumber,
          name,
          slug,
          description: `<p>Experience the timeless grace and modest elegance of the <strong>${name}</strong>. Crafted from premium breathable luxury fabrics tailored for royal Dubai occasions, everyday modest wear, and celebratory gatherings.</p><p>Features intricate detailing, tailored comfort, and exquisite drape.</p>`,
          short_description: `Luxury ${style} tailored in ${col} with premium modest finishing.`,
          sku_prefix: `DUMMY-${productNumber}`,
          tags: `dummy, modest, abaya, ${col.toLowerCase()}, luxury`,
          status: product_status.PUBLISHED,
          is_featured: i % 5 === 0,
          is_cod_allowed: true,
          published_at: new Date(),
        },
      });

      seededProductIds.push(product.id);

      // Connect categories
      if (chosenCatIds.length > 0) {
        await this.prisma.product_categories.createMany({
          data: chosenCatIds.map((cid) => ({
            product_id: product.id,
            category_id: cid,
          })),
        });
      }

      // Add product images
      await this.prisma.product_images.createMany({
        data: assignedImages.map((url, idx) => ({
          product_id: product.id,
          image_url: url,
          alt_text: `${name} view ${idx + 1}`,
          is_thumbnail: idx === 0,
          sort_order: idx,
        })),
      });

      // Add size variants
      for (const size of sizes) {
        const variantSku = `DUMMY-${productNumber}-SZ${size}`;
        const stockQty = 15 + ((i + parseInt(size, 10)) % 25);

        const variant = await this.prisma.product_variants.create({
          data: {
            product_id: product.id,
            sku: variantSku,
            price: basePrice,
            compare_price: comparePrice,
            cost_price: Math.round(basePrice * 0.45),
            status: variant_status.ACTIVE,
          },
        });

        // Map Size attribute
        if (sizeValueMap[size]) {
          await this.prisma.variant_attribute_values.create({
            data: {
              variant_id: variant.id,
              attribute_value_id: sizeValueMap[size],
            },
          });
        }

        // Warehouse inventory
        if (warehouse) {
          await this.prisma.inventory.create({
            data: {
              variant_id: variant.id,
              warehouse_id: warehouse.id,
              quantity: stockQty,
              available_quantity: stockQty,
            },
          });
        }
      }
    }

    return {
      success: true,
      count: seededProductIds.length,
      message: `Successfully inserted ${seededProductIds.length} dummy products with size variants, stock inventory, and high-res imagery!`,
    };
  }

  /**
   * Delete ALL dummy products without touching real inventory or products
   */
  async purgeDummyProducts() {
    const dummyProducts = await this.prisma.products.findMany({
      where: {
        OR: [
          { tags: { contains: 'dummy' } },
          { slug: { startsWith: 'dummy-' } },
        ],
      },
      select: { id: true },
    });

    const productIds = dummyProducts.map((p) => p.id);
    if (productIds.length === 0) {
      return {
        success: true,
        deleted_count: 0,
        message: 'No dummy products found to delete. Real products remain untouched.',
      };
    }

    const variants = await this.prisma.product_variants.findMany({
      where: { product_id: { in: productIds } },
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);

    if (variantIds.length > 0) {
      await this.prisma.cart_items.deleteMany({ where: { variant_id: { in: variantIds } } });
      await this.prisma.order_items.deleteMany({ where: { variant_id: { in: variantIds } } });
      await this.prisma.inventory.deleteMany({ where: { variant_id: { in: variantIds } } });
      await this.prisma.variant_attribute_values.deleteMany({ where: { variant_id: { in: variantIds } } });
      await this.prisma.variant_images.deleteMany({ where: { variant_id: { in: variantIds } } });
      await this.prisma.product_variants.deleteMany({ where: { id: { in: variantIds } } });
    }

    await this.prisma.product_categories.deleteMany({ where: { product_id: { in: productIds } } });
    await this.prisma.product_related_categories.deleteMany({ where: { product_id: { in: productIds } } });
    await this.prisma.product_images.deleteMany({ where: { product_id: { in: productIds } } });
    await this.prisma.wishlists.deleteMany({ where: { product_id: { in: productIds } } });
    await this.prisma.reviews.deleteMany({ where: { product_id: { in: productIds } } });

    const result = await this.prisma.products.deleteMany({
      where: { id: { in: productIds } },
    });

    return {
      success: true,
      deleted_count: result.count,
      message: `Successfully deleted all ${result.count} dummy products. All real store products are safe.`,
    };
  }
}


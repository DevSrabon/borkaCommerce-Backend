import { PrismaClient, product_status, variant_status, discount_type, offer_type, offer_status } from '@prisma/client';
import * as crypto from 'crypto';

import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

async function main() {
  console.log('Seeding production-grade database for Saba Al Wadi...');

  // 1. Clear existing data in reverse order of relationships
  await prisma.inventory_transactions.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.variant_images.deleteMany();
  await prisma.variant_attribute_values.deleteMany();
  await prisma.product_images.deleteMany();
  await prisma.product_categories.deleteMany();
  await prisma.offer_products.deleteMany();
  await prisma.offer_categories.deleteMany();
  await prisma.order_items.deleteMany();
  await prisma.payments.deleteMany();
  await prisma.orders.deleteMany();
  await prisma.cart_items.deleteMany();
  await prisma.carts.deleteMany();
  await prisma.wishlists.deleteMany();
  await prisma.reviews.deleteMany();
  await prisma.customer_addresses.deleteMany();
  await prisma.sessions.deleteMany();
  await prisma.accounts.deleteMany();
  await prisma.customers.deleteMany();
  await prisma.coupons.deleteMany();
  await prisma.offers.deleteMany();
  await prisma.attribute_values.deleteMany();
  await prisma.attributes.deleteMany();
  await prisma.product_variants.deleteMany();
  await prisma.products.deleteMany();
  await prisma.categories.deleteMany();
  await prisma.warehouses.deleteMany();
  await prisma.banners.deleteMany();
  await prisma.site_settings.deleteMany();

  console.log('Cleared existing data.');

  // 2. Seed Warehouses
  const warehouse = await prisma.warehouses.create({
    data: {
      name: 'Dubai Main Warehouse',
      location: 'Al Quoz Industrial Area 3, Dubai, UAE',
    },
  });

  // 3. Seed Categories (Recursive Tree)
  const abaya = await prisma.categories.create({
    data: {
      name: 'Abaya',
      slug: 'abaya',
      description: 'Elegant Emirati & Modest Designer Abayas',
      is_active: true,
      sort_order: 1,
    },
  });

  const casualAbaya = await prisma.categories.create({
    data: {
      name: 'Casual',
      slug: 'abaya-casual',
      parent_id: abaya.id,
      description: 'Breathable, minimalist daily wear abayas',
      is_active: true,
      sort_order: 1,
    },
  });

  const luxuryAbaya = await prisma.categories.create({
    data: {
      name: 'Luxury',
      slug: 'abaya-luxury',
      parent_id: abaya.id,
      description: 'Hand-embellished pure silk & velvet couture abayas',
      is_active: true,
      sort_order: 2,
    },
  });

  const eidAbaya = await prisma.categories.create({
    data: {
      name: 'Eid Collection',
      slug: 'abaya-eid-collection',
      parent_id: abaya.id,
      description: 'Exclusive festive celebratory ensembles',
      is_active: true,
      sort_order: 3,
    },
  });

  const shayla = await prisma.categories.create({
    data: {
      name: 'Shayla',
      slug: 'shayla',
      description: 'Flowing matching Chiffon & Silk Georgette scarves',
      is_active: true,
      sort_order: 2,
    },
  });

  const niqab = await prisma.categories.create({
    data: {
      name: 'Niqab',
      slug: 'niqab',
      description: 'Ultra-breathable premium single & double layer niqabs',
      is_active: true,
      sort_order: 3,
    },
  });

  // 4. Seed Variant Attributes
  const colorAttr = await prisma.attributes.create({ data: { name: 'Color' } });
  const sizeAttr = await prisma.attributes.create({ data: { name: 'Size' } });
  const fabricAttr = await prisma.attributes.create({ data: { name: 'Fabric' } });

  // Attribute values - Color
  const blackVal = await prisma.attribute_values.create({ data: { attribute_id: colorAttr.id, value: 'Black' } });
  const navyVal = await prisma.attribute_values.create({ data: { attribute_id: colorAttr.id, value: 'Navy Blue' } });
  const maroonVal = await prisma.attribute_values.create({ data: { attribute_id: colorAttr.id, value: 'Maroon' } });
  const sageVal = await prisma.attribute_values.create({ data: { attribute_id: colorAttr.id, value: 'Sage Green' } });
  const mochaVal = await prisma.attribute_values.create({ data: { attribute_id: colorAttr.id, value: 'Mocha Brown' } });

  // Attribute values - Size
  const size52Val = await prisma.attribute_values.create({ data: { attribute_id: sizeAttr.id, value: '52' } });
  const size54Val = await prisma.attribute_values.create({ data: { attribute_id: sizeAttr.id, value: '54' } });
  const size56Val = await prisma.attribute_values.create({ data: { attribute_id: sizeAttr.id, value: '56' } });
  const size58Val = await prisma.attribute_values.create({ data: { attribute_id: sizeAttr.id, value: '58' } });

  // Attribute values - Fabric
  const nidhaVal = await prisma.attribute_values.create({ data: { attribute_id: fabricAttr.id, value: 'Nidha' } });
  const linenVal = await prisma.attribute_values.create({ data: { attribute_id: fabricAttr.id, value: 'Linen' } });
  const silkVal = await prisma.attribute_values.create({ data: { attribute_id: fabricAttr.id, value: 'Silk' } });
  const chiffonVal = await prisma.attribute_values.create({ data: { attribute_id: fabricAttr.id, value: 'Chiffon' } });

  // 5. Seed Campaigns / Offers
  const flashSale = await prisma.offers.create({
    data: {
      name: 'Eid Eve Flash Sale',
      type: offer_type.FLASH_SALE,
      priority: 100, // Highest priority
      discount_type: discount_type.PERCENTAGE,
      discount_value: 20, // 20% OFF
      start_date: new Date('2026-01-01T00:00:00Z'),
      end_date: new Date('2026-12-31T23:59:59Z'),
      status: offer_status.ACTIVE,
    },
  });

  const eidSale = await prisma.offers.create({
    data: {
      name: 'Eid Collection 2026',
      type: offer_type.EID_SALE,
      priority: 50,
      discount_type: discount_type.PERCENTAGE,
      discount_value: 15, // 15% OFF
      start_date: new Date('2026-01-01T00:00:00Z'),
      end_date: new Date('2026-12-31T23:59:59Z'),
      status: offer_status.ACTIVE,
    },
  });

  // 6. Seed Coupons
  await prisma.coupons.createMany({
    data: [
      {
        code: 'WELCOME10',
        type: 'discount',
        discount_type: discount_type.PERCENTAGE,
        discount_value: 10,
        minimum_amount: 100.0,
        maximum_discount: 50.0,
        usage_limit: 1000,
        usage_per_customer: 1,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        status: true,
      },
      {
        code: 'EID2026',
        type: 'discount',
        discount_type: discount_type.PERCENTAGE,
        discount_value: 15,
        minimum_amount: 250.0,
        maximum_discount: 100.0,
        usage_limit: 500,
        usage_per_customer: 1,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        status: true,
      },
    ],
  });

  // Helper to create a product with images, variants, stock, and offer
  async function createProductWithVariants(config: {
    name: string;
    slug: string;
    description: string;
    short_description: string;
    sku_prefix: string;
    is_featured: boolean;
    categoryIds: string[];
    images: string[];
    offerId?: string;
    variants: {
      sku: string;
      price: number;
      compare_price: number | null;
      stock: number;
      colorValId: string;
      sizeValId: string;
      fabricValId: string;
    }[];
  }) {
    const prod = await prisma.products.create({
      data: {
        name: config.name,
        slug: config.slug,
        description: config.description,
        short_description: config.short_description,
        sku_prefix: config.sku_prefix,
        status: product_status.PUBLISHED,
        is_featured: config.is_featured,
        published_at: new Date(),
      },
    });

    // Categories
    await prisma.product_categories.createMany({
      data: config.categoryIds.map((cid) => ({ product_id: prod.id, category_id: cid })),
    });

    // Images
    await prisma.product_images.createMany({
      data: config.images.map((url, idx) => ({
        product_id: prod.id,
        image_url: url,
        is_thumbnail: idx === 0,
        sort_order: idx + 1,
      })),
    });

    // Variants
    for (const v of config.variants) {
      const createdVariant = await prisma.product_variants.create({
        data: {
          product_id: prod.id,
          sku: v.sku,
          price: v.price,
          compare_price: v.compare_price,
          status: variant_status.ACTIVE,
        },
      });

      // Attribute mappings
      await prisma.variant_attribute_values.createMany({
        data: [
          { variant_id: createdVariant.id, attribute_value_id: v.colorValId },
          { variant_id: createdVariant.id, attribute_value_id: v.sizeValId },
          { variant_id: createdVariant.id, attribute_value_id: v.fabricValId },
        ],
      });

      // Inventory
      await prisma.inventory.create({
        data: {
          variant_id: createdVariant.id,
          warehouse_id: warehouse.id,
          quantity: v.stock,
          available_quantity: v.stock,
          reserved_quantity: 0,
        },
      });

      // Attach Offer if specified
      if (config.offerId) {
        await prisma.offer_products.create({
          data: {
            offer_id: config.offerId,
            variant_id: createdVariant.id,
          },
        });
      }
    }

    return prod;
  }

  // 7. Seed Production Catalog
  console.log('Seeding products catalog...');

  // 1. Classic Black Nidha Abaya (Flash Sale 20% OFF)
  const product1 = await createProductWithVariants({
    name: 'Classic Black Nidha Abaya',
    slug: 'classic-black-nidha-abaya',
    description: 'A signature everyday abaya tailored with fine UAE Nidha fabric. Features simple classic detailing, flowy silhouette, and breathable comfort for daily modest wear.',
    short_description: 'Signature everyday black Nidha abaya for daily wear.',
    sku_prefix: 'ABA-BLK',
    is_featured: true,
    categoryIds: [abaya.id, casualAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=800',
    ],
    offerId: flashSale.id, // 20% OFF!
    variants: [
      { sku: 'ABA-BLK-54-NID', price: 250, compare_price: 300, stock: 45, colorValId: blackVal.id, sizeValId: size54Val.id, fabricValId: nidhaVal.id },
      { sku: 'ABA-BLK-56-NID', price: 250, compare_price: 300, stock: 35, colorValId: blackVal.id, sizeValId: size56Val.id, fabricValId: nidhaVal.id },
    ],
  });

  // 2. Luxury Silk Embroidered Abaya (Eid Sale 15% OFF)
  const product2 = await createProductWithVariants({
    name: 'Luxury Silk Embroidered Abaya',
    slug: 'luxury-silk-embroidered-abaya',
    description: 'Exquisite luxury abaya crafted from pure Japanese silk. Detailed with intricate floral hand-embroidery along the sleeve cuffs and hemline. Perfect for celebratory occasions.',
    short_description: 'Luxury embroidered silk abaya for Eid and special occasions.',
    sku_prefix: 'ABA-SLK',
    is_featured: true,
    categoryIds: [abaya.id, luxuryAbaya.id, eidAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=800',
    ],
    offerId: eidSale.id, // 15% OFF!
    variants: [
      { sku: 'ABA-SLK-54-NAV', price: 450, compare_price: 550, stock: 20, colorValId: navyVal.id, sizeValId: size54Val.id, fabricValId: silkVal.id },
      { sku: 'ABA-SLK-56-NAV', price: 450, compare_price: 550, stock: 15, colorValId: navyVal.id, sizeValId: size56Val.id, fabricValId: silkVal.id },
    ],
  });

  // 3. Royal Navy Velvet Embellished Abaya (Flash Sale 20% OFF)
  const product3 = await createProductWithVariants({
    name: 'Royal Navy Velvet Embellished Abaya',
    slug: 'royal-navy-velvet-embellished-abaya',
    description: 'Opulent deep navy velvet abaya detailed with subtle Swarovski crystal motifs. Ideal for evening gatherings and formal festive banquets.',
    short_description: 'Deep royal navy velvet abaya with crystal embellishments.',
    sku_prefix: 'ABA-VLV',
    is_featured: true,
    categoryIds: [abaya.id, luxuryAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=800',
    ],
    offerId: flashSale.id, // 20% OFF!
    variants: [
      { sku: 'ABA-VLV-54-NAV', price: 520, compare_price: 650, stock: 18, colorValId: navyVal.id, sizeValId: size54Val.id, fabricValId: nidhaVal.id },
      { sku: 'ABA-VLV-56-NAV', price: 520, compare_price: 650, stock: 12, colorValId: navyVal.id, sizeValId: size56Val.id, fabricValId: nidhaVal.id },
    ],
  });

  // 4. Dubai Butterfly Flowing Chiffon Abaya (Flash Sale 20% OFF)
  const product4 = await createProductWithVariants({
    name: 'Dubai Butterfly Flowing Chiffon Abaya',
    slug: 'dubai-butterfly-flowing-chiffon-abaya',
    description: 'Flattering butterfly cut designed with double-layer Korean chiffon. Drapes gracefully with seamless modesty and lightweight elegance.',
    short_description: 'Airy double-layer butterfly cut chiffon abaya.',
    sku_prefix: 'ABA-CHF',
    is_featured: true,
    categoryIds: [abaya.id, casualAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=800',
    ],
    offerId: flashSale.id, // 20% OFF!
    variants: [
      { sku: 'ABA-CHF-54-MAR', price: 320, compare_price: 400, stock: 25, colorValId: maroonVal.id, sizeValId: size54Val.id, fabricValId: chiffonVal.id },
      { sku: 'ABA-CHF-56-MAR', price: 320, compare_price: 400, stock: 20, colorValId: maroonVal.id, sizeValId: size56Val.id, fabricValId: chiffonVal.id },
    ],
  });

  // 5. Festive Sage Green Silk Bisht Abaya (Eid Sale 15% OFF)
  const product5 = await createProductWithVariants({
    name: 'Festive Sage Green Silk Bisht Abaya',
    slug: 'festive-sage-green-silk-bisht-abaya',
    description: 'Contemporary bisht cut in soothing sage green. Tailored from lustrous raw silk with matching handmade tassel belt.',
    short_description: 'Modern loose bisht cut silk abaya in calming sage green.',
    sku_prefix: 'ABA-BST',
    is_featured: false,
    categoryIds: [abaya.id, luxuryAbaya.id, eidAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=800',
    ],
    offerId: eidSale.id, // 15% OFF!
    variants: [
      { sku: 'ABA-BST-54-SAG', price: 490, compare_price: 580, stock: 15, colorValId: sageVal.id, sizeValId: size54Val.id, fabricValId: silkVal.id },
      { sku: 'ABA-BST-56-SAG', price: 490, compare_price: 580, stock: 15, colorValId: sageVal.id, sizeValId: size56Val.id, fabricValId: silkVal.id },
    ],
  });

  // 6. Everyday Casual Breathable Linen Abaya (Regular Price)
  const product6 = await createProductWithVariants({
    name: 'Everyday Casual Breathable Linen Abaya',
    slug: 'everyday-casual-breathable-linen-abaya',
    description: 'Crafted from 100% natural pure linen fabric. Exceptional thermal comfort designed specifically for the hot UAE summer climate.',
    short_description: 'Pure natural linen breathable abaya for warm days.',
    sku_prefix: 'ABA-LIN',
    is_featured: false,
    categoryIds: [abaya.id, casualAbaya.id],
    images: [
      'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=800',
    ],
    variants: [
      { sku: 'ABA-LIN-54-MCH', price: 220, compare_price: null, stock: 30, colorValId: mochaVal.id, sizeValId: size54Val.id, fabricValId: linenVal.id },
      { sku: 'ABA-LIN-56-MCH', price: 220, compare_price: null, stock: 25, colorValId: mochaVal.id, sizeValId: size56Val.id, fabricValId: linenVal.id },
    ],
  });

  // 7. Pure Black Chiffon Flowing Shayla (Shayla)
  const product7 = await createProductWithVariants({
    name: 'Pure Black Chiffon Flowing Shayla',
    slug: 'pure-black-chiffon-flowing-shayla',
    description: 'Premium lightweight Korean chiffon shayla with clean surged edges. Ample length (200cm x 75cm) for full modest coverage and effortless styling.',
    short_description: 'Generous 200cm chiffon matching black shayla.',
    sku_prefix: 'SHY-BLK',
    is_featured: false,
    categoryIds: [shayla.id],
    images: [
      'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&q=80&w=800',
    ],
    variants: [
      { sku: 'SHY-BLK-STD', price: 75, compare_price: 95, stock: 60, colorValId: blackVal.id, sizeValId: size54Val.id, fabricValId: chiffonVal.id },
    ],
  });

  // 8. Breathable Single Layer Elastic Niqab (Niqab)
  const product8 = await createProductWithVariants({
    name: 'Breathable Single-Layer Elastic Niqab',
    slug: 'breathable-single-layer-elastic-niqab',
    description: 'Ultra-soft microfiber breathable fabric designed for maximum airflow and daily comfort. Features comfortable non-pinching elastic headband.',
    short_description: 'Soft microfiber breathable daily wear elastic niqab.',
    sku_prefix: 'NQB-SGL',
    is_featured: false,
    categoryIds: [niqab.id],
    images: [
      'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=800',
    ],
    variants: [
      { sku: 'NQB-SGL-BLK', price: 45, compare_price: 60, stock: 50, colorValId: blackVal.id, sizeValId: size54Val.id, fabricValId: chiffonVal.id },
    ],
  });

  // 8. Seed Customers & Addresses
  console.log('Seeding customer accounts...');
  const adminSrabon = await prisma.customers.create({
    data: {
      first_name: 'Srabon',
      last_name: 'Rahman',
      email: 'srabon@example.com',
      phone: '+971501234567',
      password: hashPassword('password123'),
      role: 'ADMIN',
      is_blocked: false,
      email_verified: true,
    },
  });

  const adminMain = await prisma.customers.create({
    data: {
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      phone: '+971500000000',
      password: hashPassword('password123'),
      role: 'ADMIN',
      is_blocked: false,
      email_verified: true,
    },
  });

  const customerFatima = await prisma.customers.create({
    data: {
      first_name: 'Fatima',
      last_name: 'Al-Zahra',
      email: 'fatima@example.com',
      phone: '+971509876543',
      password: hashPassword('password123'),
      role: 'CUSTOMER',
      is_blocked: false,
      email_verified: true,
    },
  });

  const customerAisha = await prisma.customers.create({
    data: {
      first_name: 'Aisha',
      last_name: 'Mansoor',
      email: 'aisha@example.com',
      phone: '+971508889999',
      password: hashPassword('password123'),
      role: 'CUSTOMER',
      is_blocked: false,
      email_verified: true,
    },
  });

  const customerMariamBlocked = await prisma.customers.create({
    data: {
      first_name: 'Mariam',
      last_name: 'Khalil',
      email: 'mariam@example.com',
      phone: '+971507771111',
      password: hashPassword('password123'),
      role: 'CUSTOMER',
      is_blocked: true, // Blocked user for testing block functionality!
      email_verified: false,
    },
  });

  // Addresses
  const fatimaAddr = await prisma.customer_addresses.create({
    data: {
      customer_id: customerFatima.id,
      country: 'United Arab Emirates',
      phone: '+971 50 123 4567',
      city: 'Dubai',
      postal_code: '00000',
      full_address: 'Marina Gate 2, Apt 1804, Al Marsa Street, Dubai Marina',
      is_default: true,
    },
  });

  const srabonAddr = await prisma.customer_addresses.create({
    data: {
      customer_id: adminSrabon.id,
      country: 'United Arab Emirates',
      phone: '+971 52 345 6789',
      city: 'Abu Dhabi',
      postal_code: '00000',
      full_address: 'Tower 3, Flat 9A, Marina Square, Al Reem Island',
      is_default: true,
    },
  });

  // 9. Seed Orders (Enabling Verified Buyer Purchases)
  console.log('Seeding customer orders...');
  const var1 = await prisma.product_variants.findFirst({ where: { product_id: product1.id } });
  const var2 = await prisma.product_variants.findFirst({ where: { product_id: product2.id } });
  const var3 = await prisma.product_variants.findFirst({ where: { product_id: product3.id } });

  if (var1 && var2 && var3) {
    // Order 1 for Fatima
    const order1 = await prisma.orders.create({
      data: {
        order_number: 'BC-2026-1001',
        customer_id: customerFatima.id,
        status: 'DELIVERED',
        subtotal: 450.0,
        discount: 67.5, // 15% discount
        shipping: 0.0,
        tax: 19.12,
        total: 401.62,
        currency: 'AED',
        payment_status: 'PAID',
        payment_method: 'STRIPE',
        items: {
          create: [
            {
              variant_id: var2.id,
              product_name: product2.name,
              variant_name: 'Navy Blue / Size 54 / Silk',
              sku: var2.sku,
              price: var2.price,
              quantity: 1,
              discount: 67.5,
              subtotal: 382.5,
            },
          ],
        },
        payments: {
          create: [
            {
              provider: 'STRIPE',
              provider_payment_intent: 'pi_mock_123456789',
              amount: 401.62,
              currency: 'AED',
              status: 'PAID',
              paid_at: new Date(),
            },
          ],
        },
      },
    });

    // Order 2 for Srabon
    const order2 = await prisma.orders.create({
      data: {
        order_number: 'BC-2026-1002',
        customer_id: adminSrabon.id,
        status: 'DELIVERED',
        subtotal: 250.0,
        discount: 50.0, // 20% discount
        shipping: 0.0,
        tax: 10.0,
        total: 210.0,
        currency: 'AED',
        payment_status: 'PAID',
        payment_method: 'CASH_ON_DELIVERY',
        items: {
          create: [
            {
              variant_id: var1.id,
              product_name: product1.name,
              variant_name: 'Black / Size 54 / Nidha',
              sku: var1.sku,
              price: var1.price,
              quantity: 1,
              discount: 50.0,
              subtotal: 200.0,
            },
          ],
        },
      },
    });

    // Order 3 for Aisha
    const order3 = await prisma.orders.create({
      data: {
        order_number: 'BC-2026-1003',
        customer_id: customerAisha.id,
        status: 'CONFIRMED',
        subtotal: 520.0,
        discount: 104.0, // 20% discount
        shipping: 0.0,
        tax: 20.8,
        total: 436.8,
        currency: 'AED',
        payment_status: 'PAID',
        payment_method: 'STRIPE',
        items: {
          create: [
            {
              variant_id: var3.id,
              product_name: product3.name,
              variant_name: 'Navy Blue / Size 54 / Nidha',
              sku: var3.sku,
              price: var3.price,
              quantity: 1,
              discount: 104.0,
              subtotal: 416.0,
            },
          ],
        },
      },
    });
  }

  // 10. Seed Authentic Verified Reviews
  console.log('Seeding customer reviews...');
  await prisma.reviews.createMany({
    data: [
      {
        product_id: product1.id,
        customer_id: adminSrabon.id,
        rating: 5,
        review: 'The quality of the Nidha fabric is truly second to none. Extremely lightweight, opaque, and keeps me cool all day. The tailoring is flawless!',
        status: 'APPROVED',
      },
      {
        product_id: product2.id,
        customer_id: customerFatima.id,
        rating: 5,
        review: 'Wore this exquisite silk abaya for our Eid family gathering and everyone asked where I got it. The hand-embroidery on the sleeves looks royal!',
        status: 'APPROVED',
      },
      {
        product_id: product3.id,
        customer_id: customerAisha.id,
        rating: 5,
        review: 'Luxurious velvet with a stunning rich navy tone. Feels high-end and comfortable without feeling overly heavy.',
        status: 'APPROVED',
      },
    ],
  });

  // 11. Seed Homepage Banners
  console.log('Seeding homepage banners...');
  await prisma.banners.createMany({
    data: [
      // Hero Banners (1920x800)
      {
        title: 'Eid Collection 2026',
        subtitle: 'Handcrafted luxury abayas with pure silk embroidery & timeless modesty.',
        cta_text: 'Explore Collection',
        cta_link: '/catalog?category=abaya-eid-collection',
        image_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=1920',
        alt_text: 'Eid Abaya Collection Hero Banner',
        size_type: 'HERO',
        size_description: 'Desktop Hero: 1920x800px (Full Width)',
        sort_order: 1,
        is_active: true,
      },
      {
        title: 'Minimalist Everyday Abayas',
        subtitle: 'Tailored with soft UAE Nidha fabric for effortless comfort and daily grace.',
        cta_text: 'Shop Casuals',
        cta_link: '/catalog?category=abaya-casual',
        image_url: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=1920',
        alt_text: 'Casual Nidha Abayas Hero Banner',
        size_type: 'HERO',
        size_description: 'Desktop Hero: 1920x800px (Full Width)',
        sort_order: 2,
        is_active: true,
      },
      // Small Promotional Banners (600x400)
      {
        title: 'Flash Sale: 20% OFF Selected Abayas',
        subtitle: 'Use code WELCOME10 for an additional 10% discount on order above 100 AED.',
        cta_text: 'Claim Offer',
        cta_link: '/offers',
        image_url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&q=80&w=800',
        alt_text: 'Flash Sale Promo Card',
        size_type: 'SMALL',
        size_description: 'Promo Card: 600x400px (Small Banner)',
        sort_order: 1,
        is_active: true,
      },
      {
        title: 'Matching Shayla & Niqabs',
        subtitle: 'Complete your modest ensemble with hand-stitched matching accessories.',
        cta_text: 'View Scarves',
        cta_link: '/catalog?category=shayla',
        image_url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=800',
        alt_text: 'Shayla & Scarves Mini Banner',
        size_type: 'SMALL',
        size_description: 'Promo Card: 600x400px (Small Banner)',
        sort_order: 2,
        is_active: true,
      },
      {
        title: 'Free Express UAE Shipping',
        subtitle: 'Complimentary express delivery across Dubai & UAE on orders over 500 AED.',
        cta_text: 'Shop Now',
        cta_link: '/catalog',
        image_url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&q=80&w=800',
        alt_text: 'UAE Express Shipping Banner',
        size_type: 'SMALL',
        size_description: 'Promo Card: 600x400px (Small Banner)',
        sort_order: 3,
        is_active: true,
      },
    ],
  });

  console.log('Production database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

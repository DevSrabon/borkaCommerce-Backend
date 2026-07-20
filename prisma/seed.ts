import { PrismaClient, product_status, variant_status, discount_type, offer_type, offer_status } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('Seeding database...');

  // 1. Clear existing data in reverse order of relationships
  await prisma.inventory_transactions.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.variant_images.deleteMany();
  await prisma.variant_attribute_values.deleteMany();
  await prisma.product_images.deleteMany();
  await prisma.product_categories.deleteMany();
  await prisma.offer_products.deleteMany();
  await prisma.order_items.deleteMany();
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

  console.log('Cleared existing data.');

  // 2. Seed Warehouses
  const warehouse = await prisma.warehouses.create({
    data: {
      name: 'Dubai Main Warehouse',
      location: 'Al Quoz, Dubai, UAE',
    },
  });
  console.log(`Created warehouse: ${warehouse.name}`);

  // 3. Seed Categories (Recursive Tree)
  const abaya = await prisma.categories.create({
    data: {
      name: 'Abaya',
      slug: 'abaya',
      description: 'Elegant Muslimah Abayas',
      is_active: true,
      sort_order: 1,
    },
  });

  const casualAbaya = await prisma.categories.create({
    data: {
      name: 'Casual',
      slug: 'abaya-casual',
      parent_id: abaya.id,
      description: 'Everyday casual wear abayas',
      is_active: true,
      sort_order: 1,
    },
  });

  const luxuryAbaya = await prisma.categories.create({
    data: {
      name: 'Luxury',
      slug: 'abaya-luxury',
      parent_id: abaya.id,
      description: 'Luxury embellished premium abayas',
      is_active: true,
      sort_order: 2,
    },
  });

  const eidAbaya = await prisma.categories.create({
    data: {
      name: 'Eid Collection',
      parent_id: abaya.id,
      slug: 'abaya-eid-collection',
      description: 'Exclusive Eid festive abayas',
      is_active: true,
      sort_order: 3,
    },
  });

  const shayla = await prisma.categories.create({
    data: {
      name: 'Shayla',
      slug: 'shayla',
      description: 'Matching Shaylas and Scarves',
      is_active: true,
      sort_order: 2,
    },
  });

  const niqab = await prisma.categories.create({
    data: {
      name: 'Niqab',
      slug: 'niqab',
      description: 'Premium Niqabs',
      is_active: true,
      sort_order: 3,
    },
  });

  console.log('Seeded recursive categories structure.');

  // 4. Seed Attributes & Attribute Values
  const colorAttr = await prisma.attributes.create({
    data: { name: 'Color' },
  });

  const sizeAttr = await prisma.attributes.create({
    data: { name: 'Size' },
  });

  const fabricAttr = await prisma.attributes.create({
    data: { name: 'Fabric' },
  });

  // Attribute values for Color
  const blackVal = await prisma.attribute_values.create({
    data: { attribute_id: colorAttr.id, value: 'Black' },
  });
  const navyVal = await prisma.attribute_values.create({
    data: { attribute_id: colorAttr.id, value: 'Navy Blue' },
  });
  const maroonVal = await prisma.attribute_values.create({
    data: { attribute_id: colorAttr.id, value: 'Maroon' },
  });

  // Attribute values for Size
  const size54Val = await prisma.attribute_values.create({
    data: { attribute_id: sizeAttr.id, value: '54' },
  });
  const size56Val = await prisma.attribute_values.create({
    data: { attribute_id: sizeAttr.id, value: '56' },
  });
  const size58Val = await prisma.attribute_values.create({
    data: { attribute_id: sizeAttr.id, value: '58' },
  });

  // Attribute values for Fabric
  const nidhaVal = await prisma.attribute_values.create({
    data: { attribute_id: fabricAttr.id, value: 'Nidha' },
  });
  const linenVal = await prisma.attribute_values.create({
    data: { attribute_id: fabricAttr.id, value: 'Linen' },
  });
  const silkVal = await prisma.attribute_values.create({
    data: { attribute_id: fabricAttr.id, value: 'Silk' },
  });

  console.log('Seeded global variant attributes (Color, Size, Fabric).');

  // 5. Seed Offers
  const eidSale = await prisma.offers.create({
    data: {
      name: 'Eid Sale 2026',
      type: offer_type.EID_SALE,
      priority: 50,
      discount_type: discount_type.PERCENTAGE,
      discount_value: 15, // 15% discount
      start_date: new Date('2026-01-01T00:00:00Z'),
      end_date: new Date('2026-12-31T23:59:59Z'),
      status: offer_status.ACTIVE,
    },
  });

  const flashSale = await prisma.offers.create({
    data: {
      name: 'Eid Eve Flash Sale',
      type: offer_type.FLASH_SALE,
      priority: 100, // Higher priority wins!
      discount_type: discount_type.PERCENTAGE,
      discount_value: 20, // 20% discount
      start_date: new Date('2026-01-01T00:00:00Z'),
      end_date: new Date('2026-12-31T23:59:59Z'),
      status: offer_status.ACTIVE,
    },
  });

  // 6. Seed Coupons
  await prisma.coupons.create({
    data: {
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
  });

  console.log('Seeded offers and coupons.');

  // 7. Seed Products and Variants
  // Product 1: Classic Black Abaya
  const product1 = await prisma.products.create({
    data: {
      name: 'Classic Black Nidha Abaya',
      slug: 'classic-black-nidha-abaya',
      description: 'A premium everyday abaya made with fine Nidha fabric. Features simple classic detailing and comfortable style.',
      short_description: 'Classic black Nidha abaya for daily wear.',
      sku_prefix: 'ABA-BLK',
      seo_title: 'Classic Black Nidha Abaya | Buy Online',
      seo_description: 'Shop the premium classic black Nidha abaya online. Fine tailoring, soft texture, perfect for regular muslimah wear.',
      seo_keywords: 'black abaya, nidha abaya, casual wear abaya, buy abaya online',
      status: product_status.PUBLISHED,
      is_featured: true,
      published_at: new Date(),
    },
  });

  // Link Product 1 to categories
  await prisma.product_categories.createMany({
    data: [
      { product_id: product1.id, category_id: abaya.id },
      { product_id: product1.id, category_id: casualAbaya.id },
    ],
  });

  // Product 1 Images
  await prisma.product_images.create({
    data: {
      product_id: product1.id,
      image_url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&q=80&w=600',
      is_thumbnail: true,
      sort_order: 1,
    },
  });

  // Product 1 Variants
  // Variant A: Black / Size 54 / Nidha
  const variant1A = await prisma.product_variants.create({
    data: {
      product_id: product1.id,
      sku: 'ABA-BLK-54-NID',
      barcode: '123456789011',
      weight: 0.6,
      price: 250.0,
      compare_price: 300.0,
      cost_price: 120.0,
      status: variant_status.ACTIVE,
    },
  });

  await prisma.variant_attribute_values.createMany({
    data: [
      { variant_id: variant1A.id, attribute_value_id: blackVal.id },
      { variant_id: variant1A.id, attribute_value_id: size54Val.id },
      { variant_id: variant1A.id, attribute_value_id: nidhaVal.id },
    ],
  });

  await prisma.inventory.create({
    data: {
      variant_id: variant1A.id,
      warehouse_id: warehouse.id,
      quantity: 50,
      reserved_quantity: 0,
      available_quantity: 50,
    },
  });

  // Variant B: Black / Size 56 / Nidha
  const variant1B = await prisma.product_variants.create({
    data: {
      product_id: product1.id,
      sku: 'ABA-BLK-56-NID',
      barcode: '123456789012',
      weight: 0.65,
      price: 250.0,
      compare_price: 300.0,
      cost_price: 120.0,
      status: variant_status.ACTIVE,
    },
  });

  await prisma.variant_attribute_values.createMany({
    data: [
      { variant_id: variant1B.id, attribute_value_id: blackVal.id },
      { variant_id: variant1B.id, attribute_value_id: size56Val.id },
      { variant_id: variant1B.id, attribute_value_id: nidhaVal.id },
    ],
  });

  await prisma.inventory.create({
    data: {
      variant_id: variant1B.id,
      warehouse_id: warehouse.id,
      quantity: 35,
      reserved_quantity: 0,
      available_quantity: 35,
    },
  });

  // Add Product 1 Variant A to Offers (both Eid and Flash)
  await prisma.offer_products.createMany({
    data: [
      { offer_id: eidSale.id, variant_id: variant1A.id },
      { offer_id: flashSale.id, variant_id: variant1A.id },
    ],
  });

  // Product 2: Luxury Silk Abaya
  const product2 = await prisma.products.create({
    data: {
      name: 'Luxury Silk Embroidered Abaya',
      slug: 'luxury-silk-embroidered-abaya',
      description: 'Stunning luxury abaya crafted from pure silk. Features intricate floral hand-embroidery on sleeves and hem. Suitable for Eid and wedding ceremonies.',
      short_description: 'Luxury embroidered silk abaya for special occasions.',
      sku_prefix: 'ABA-SLK',
      seo_title: 'Luxury Silk Embroidered Abaya - Eid Special',
      seo_description: 'Discover luxury silk abayas with premium embroidery. Order online for Eid and formal events. Worldwide shipping.',
      seo_keywords: 'silk abaya, luxury abaya, embroidery abaya, eid abaya',
      status: product_status.PUBLISHED,
      is_featured: true,
      published_at: new Date(),
    },
  });

  await prisma.product_categories.createMany({
    data: [
      { product_id: product2.id, category_id: abaya.id },
      { product_id: product2.id, category_id: luxuryAbaya.id },
      { product_id: product2.id, category_id: eidAbaya.id },
    ],
  });

  await prisma.product_images.create({
    data: {
      product_id: product2.id,
      image_url: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=600',
      is_thumbnail: true,
      sort_order: 1,
    },
  });

  // Product 2 Variant: Navy Blue / Size 56 / Silk
  const variant2 = await prisma.product_variants.create({
    data: {
      product_id: product2.id,
      sku: 'ABA-SLK-56-NAV',
      barcode: '123456789021',
      weight: 0.7,
      price: 450.0,
      compare_price: 550.0,
      cost_price: 200.0,
      status: variant_status.ACTIVE,
    },
  });

  await prisma.variant_attribute_values.createMany({
    data: [
      { variant_id: variant2.id, attribute_value_id: navyVal.id },
      { variant_id: variant2.id, attribute_value_id: size56Val.id },
      { variant_id: variant2.id, attribute_value_id: silkVal.id },
    ],
  });

  await prisma.inventory.create({
    data: {
      variant_id: variant2.id,
      warehouse_id: warehouse.id,
      quantity: 15,
      reserved_quantity: 0,
      available_quantity: 15,
    },
  });

  // Link Product 2 Variant to Eid Sale
  await prisma.offer_products.create({
    data: {
      offer_id: eidSale.id,
      variant_id: variant2.id,
    },
  });

  // 8. Seed Customer & Address (Test Customer)
  // Password is 'password123' hashed (mock plain-text for now or generic hashing)
  const customer = await prisma.customers.create({
    data: {
      first_name: 'Srabon',
      last_name: 'Rahman',
      email: 'srabon@example.com',
      phone: '+971501234567',
      password: hashPassword('password123'),
      email_verified: true,
    },
  });

  const adminCustomer = await prisma.customers.create({
    data: {
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      phone: '+971500000000',
      password: hashPassword('password123'),
      email_verified: true,
    },
  });

  await prisma.customer_addresses.create({
    data: {
      customer_id: customer.id,
      country: 'United Arab Emirates',
      city: 'Dubai',
      area: 'Dubai Marina',
      street: 'Marina Boulevard',
      building: 'Marina Heights, Flat 12B',
      postal_code: '00000',
      is_default: true,
    },
  });

  console.log(`Created sample customer: ${customer.email}`);
  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

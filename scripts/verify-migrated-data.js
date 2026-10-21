const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('🔍 VERIFYING MIGRATED DATA IN POSTGRESQL');
  console.log('================================================================\n');

  // 1. Categories
  const categories = await prisma.categories.findMany();
  console.log(`✓ Categories count: ${categories.length}`);
  console.log('  Categories list:', categories.map(c => ({ name: c.name, slug: c.slug, image: c.image })));

  // 2. Attributes
  const attributes = await prisma.attributes.findMany({ include: { values: true } });
  console.log(`\n✓ Attributes count: ${attributes.length}`);
  for (const attr of attributes) {
    console.log(`  - ${attr.name}: ${attr.values.length} values (sample: ${attr.values.slice(0, 4).map(v => v.value).join(', ')})`);
  }

  // 3. Products
  const productCount = await prisma.products.count();
  const variantCount = await prisma.product_variants.count();
  const imageCount = await prisma.product_images.count();
  const inventoryCount = await prisma.inventory.count();

  console.log(`\n✓ Products:  ${productCount}`);
  console.log(`✓ Variants:  ${variantCount}`);
  console.log(`✓ Images:    ${imageCount}`);
  console.log(`✓ Inventory: ${inventoryCount}`);

  // Sample Product with full relations
  const sampleProduct = await prisma.products.findFirst({
    include: {
      product_categories: { include: { category: true } },
      images: { take: 3 },
      variants: {
        take: 2,
        include: {
          attributes: { include: { attribute_value: { include: { attribute: true } } } },
          inventories: true
        }
      }
    }
  });

  console.log('\n--- Sample Product Inspection ---');
  console.log({
    id: sampleProduct.id,
    product_number: sampleProduct.product_number,
    name: sampleProduct.name,
    slug: sampleProduct.slug,
    status: sampleProduct.status,
    categories: sampleProduct.product_categories.map(pc => pc.category.name),
    images: sampleProduct.images.map(img => ({ url: img.image_url, is_thumb: img.is_thumbnail })),
    variants: sampleProduct.variants.map(v => ({
      sku: v.sku,
      price: v.price.toString(),
      compare_price: v.compare_price ? v.compare_price.toString() : null,
      attributes: v.attributes.map(a => `${a.attribute_value.attribute.name}: ${a.attribute_value.value}`),
      stock: v.inventories.map(i => i.available_quantity)
    }))
  });

  // 4. Banners
  const banners = await prisma.banners.findMany();
  console.log(`\n✓ Banners count: ${banners.length}`);
  console.log('  Banners:', banners.map(b => ({ title: b.title, image_url: b.image_url })));

  // 5. Website Settings
  const settings = await prisma.site_settings.findMany();
  console.log(`\n✓ Website Settings: ${settings.length} settings synced`);
  console.log('  Keys:', settings.map(s => s.key).join(', '));

  // 6. Blogs
  const blogs = await prisma.blogs.findMany({ select: { title: true, slug: true, featured_image: true } });
  console.log(`\n✓ Blogs count: ${blogs.length}`);
  console.log('  Sample Blogs:', blogs.slice(0, 3));

  // 7. Coupons
  const coupons = await prisma.coupons.findMany();
  console.log(`\n✓ Coupons count: ${coupons.length}`);
  console.log('  Coupons:', coupons.map(c => ({ code: c.code, discount: `${c.discount_value} (${c.discount_type})` })));

  // 8. Customers & Addresses
  const customers = await prisma.customers.count();
  const addresses = await prisma.customer_addresses.count();
  console.log(`\n✓ Customers: ${customers}`);
  console.log(`✓ Customer Addresses: ${addresses}`);

  // Check if any old media.sabaalwadi.com remains in PostgreSQL
  console.log('\n--- Checking for any remaining media.sabaalwadi.com in PG ---');
  const prodsWithOld = await prisma.products.findMany({
    where: { description: { contains: 'media.sabaalwadi.com' } },
    select: { id: true, name: true }
  });
  const blogsWithOld = await prisma.blogs.findMany({
    where: { content: { contains: 'media.sabaalwadi.com' } },
    select: { id: true, title: true }
  });
  const imagesWithOld = await prisma.product_images.findMany({
    where: { image_url: { contains: 'media.sabaalwadi.com' } },
    select: { id: true }
  });

  console.log(`  Products with old media domain: ${prodsWithOld.length}`);
  console.log(`  Blogs with old media domain:    ${blogsWithOld.length}`);
  console.log(`  Images with old media domain:   ${imagesWithOld.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);

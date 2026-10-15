const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MEDIA_ROOT = 'https://media.sabaalwadi.com/saba-media/';

function getFullMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.replace(/^\/+/, '');
  return `${MEDIA_ROOT}${cleanPath}`;
}

async function main() {
  console.log('Connecting to remote MySQL (READ ONLY mode)...');
  const mysqlConn = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });

  console.log('✓ Connected to remote MySQL (saba-ecom) successfully!');

  // Ensure primary warehouse exists in PostgreSQL
  let defaultWarehouse = await prisma.warehouses.findFirst({
    where: { name: { contains: 'Dubai', mode: 'insensitive' } },
  });
  if (!defaultWarehouse) {
    defaultWarehouse = await prisma.warehouses.create({
      data: {
        name: 'Dubai Main Warehouse',
        location: 'Al Quoz Industrial Area 3, Dubai, UAE',
      },
    });
  }
  console.log(`✓ Default warehouse: ${defaultWarehouse.name} (${defaultWarehouse.id})`);

  // =========================================================================
  // 1. MIGRATE CATEGORIES
  // =========================================================================
  console.log('\n--- 1. Migrating Categories ---');
  const [remoteCategories] = await mysqlConn.query('SELECT * FROM category');
  console.log(`Found ${remoteCategories.length} categories on remote MySQL.`);

  const categoryMap = new Map(); // remote cate_id -> local category.id

  for (const rc of remoteCategories) {
    const slug = rc.cate_slug || rc.cate_name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const imageUrl = getFullMediaUrl(rc.cate_image);

    const localCat = await prisma.categories.upsert({
      where: { slug },
      update: {
        name: rc.cate_name_en,
        image: imageUrl,
        image_alt_text: rc.alt_text || rc.cate_name_en,
        is_active: rc.cate_status === 1,
        show_on_homepage: rc.cate_home === 1,
        show_in_navbar: true,
      },
      create: {
        name: rc.cate_name_en,
        slug,
        image: imageUrl,
        image_alt_text: rc.alt_text || rc.cate_name_en,
        is_active: rc.cate_status === 1,
        show_on_homepage: rc.cate_home === 1,
        show_in_navbar: true,
      },
    });

    categoryMap.set(rc.cate_id, localCat.id);
    console.log(`  ✓ Category: "${rc.cate_name_en}" -> ${localCat.slug}`);
  }

  // =========================================================================
  // 2. MIGRATE ATTRIBUTES & ATTRIBUTE VALUES (Color, Size, Fabric)
  // =========================================================================
  console.log('\n--- 2. Migrating Attributes (Color, Size, Fabric) ---');

  // Color attribute
  let colorAttr = await prisma.attributes.findUnique({ where: { name: 'Color' } });
  if (!colorAttr) {
    colorAttr = await prisma.attributes.create({ data: { name: 'Color' } });
  }

  // Size attribute
  let sizeAttr = await prisma.attributes.findUnique({ where: { name: 'Size' } });
  if (!sizeAttr) {
    sizeAttr = await prisma.attributes.create({ data: { name: 'Size' } });
  }

  // Fabric attribute
  let fabricAttr = await prisma.attributes.findUnique({ where: { name: 'Fabric' } });
  if (!fabricAttr) {
    fabricAttr = await prisma.attributes.create({ data: { name: 'Fabric' } });
  }

  // Fetch remote colors
  const [remoteColors] = await mysqlConn.query('SELECT * FROM color');
  const colorMap = new Map(); // remote id -> local attribute_value.id
  for (const rc of remoteColors) {
    const val = (rc.color_en || '').trim();
    if (!val) continue;
    const localVal = await prisma.attribute_values.upsert({
      where: { attribute_id_value: { attribute_id: colorAttr.id, value: val } },
      update: {},
      create: { attribute_id: colorAttr.id, value: val },
    });
    colorMap.set(rc.id, localVal.id);
  }
  console.log(`  ✓ Synced ${remoteColors.length} Color values.`);

  // Fetch remote sizes
  const [remoteSizes] = await mysqlConn.query('SELECT * FROM size');
  const sizeMap = new Map(); // remote id -> local attribute_value.id
  for (const rs of remoteSizes) {
    const val = (rs.size || '').trim();
    if (!val) continue;
    const localVal = await prisma.attribute_values.upsert({
      where: { attribute_id_value: { attribute_id: sizeAttr.id, value: val } },
      update: {},
      create: { attribute_id: sizeAttr.id, value: val },
    });
    sizeMap.set(rs.id, localVal.id);
  }
  console.log(`  ✓ Synced ${remoteSizes.length} Size values.`);

  // Fetch remote fabrics
  const [remoteFabrics] = await mysqlConn.query('SELECT * FROM fabric');
  const fabricMap = new Map(); // remote id -> local attribute_value.id
  for (const rf of remoteFabrics) {
    const val = (rf.name_en || '').trim();
    if (!val) continue;
    const localVal = await prisma.attribute_values.upsert({
      where: { attribute_id_value: { attribute_id: fabricAttr.id, value: val } },
      update: {},
      create: { attribute_id: fabricAttr.id, value: val },
    });
    fabricMap.set(rf.id, localVal.id);
  }
  console.log(`  ✓ Synced ${remoteFabrics.length} Fabric values.`);

  // =========================================================================
  // 3. MIGRATE PRODUCTS, IMAGES, VARIANTS & INVENTORIES
  // =========================================================================
  console.log('\n--- 3. Migrating Products, Images & Variants ---');
  const [remoteProducts] = await mysqlConn.query('SELECT * FROM product ORDER BY p_id ASC');
  console.log(`Found ${remoteProducts.length} products on remote MySQL.`);

  // Fetch all product_category links
  const [remoteProdCats] = await mysqlConn.query('SELECT * FROM product_category');
  const prodCatMap = new Map();
  for (const pc of remoteProdCats) {
    if (!prodCatMap.has(pc.p_id)) prodCatMap.set(pc.p_id, []);
    prodCatMap.get(pc.p_id).push(pc.category_id);
  }

  // Fetch all product_images
  const [remoteImages] = await mysqlConn.query('SELECT * FROM product_image');
  const prodImageMap = new Map();
  for (const pi of remoteImages) {
    if (!prodImageMap.has(pi.pi_p_id)) prodImageMap.set(pi.pi_p_id, []);
    prodImageMap.get(pi.pi_p_id).push(pi);
  }

  // Fetch all color_images
  const [remoteColorImages] = await mysqlConn.query('SELECT * FROM color_image');
  const prodColorImageMap = new Map();
  for (const ci of remoteColorImages) {
    if (!prodColorImageMap.has(ci.p_id)) prodColorImageMap.set(ci.p_id, []);
    prodColorImageMap.get(ci.p_id).push(ci);
  }

  // Fetch all variant_products
  const [remoteVariants] = await mysqlConn.query('SELECT * FROM variant_product');
  const prodVariantMap = new Map();
  for (const vp of remoteVariants) {
    if (!prodVariantMap.has(vp.p_id)) prodVariantMap.set(vp.p_id, []);
    prodVariantMap.get(vp.p_id).push(vp);
  }

  // Fetch all p_size
  const [remoteProductSizes] = await mysqlConn.query('SELECT * FROM p_size');
  const prodSizeMap = new Map();
  for (const ps of remoteProductSizes) {
    if (!prodSizeMap.has(ps.p_id)) prodSizeMap.set(ps.p_id, []);
    prodSizeMap.get(ps.p_id).push(ps.size_id);
  }

  // Fetch all p_color
  const [remoteProductColors] = await mysqlConn.query('SELECT * FROM p_color');
  const prodColorMap = new Map();
  for (const pc of remoteProductColors) {
    if (!prodColorMap.has(pc.p_id)) prodColorMap.set(pc.p_id, []);
    prodColorMap.get(pc.p_id).push(pc.color_id);
  }

  // Fetch all inventory
  const [remoteInventory] = await mysqlConn.query('SELECT * FROM inventory');
  const prodInventoryMap = new Map();
  for (const inv of remoteInventory) {
    prodInventoryMap.set(inv.i_p_id, inv.i_quantity_available);
  }

  // Determine current max product_number
  const allExistingProducts = await prisma.products.findMany({
    select: { product_number: true },
    where: { product_number: { not: null } },
  });
  const maxPno = Math.max(
    1000,
    ...allExistingProducts
      .map(p => parseInt((p.product_number || '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n))
  );
  let nextProductSeq = maxPno + 1;

  for (const rp of remoteProducts) {
    const slug = rp.p_slug || rp.p_name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existingProduct = await prisma.products.findUnique({ where: { slug } });
    const productNumber = existingProduct?.product_number || `P${nextProductSeq++}`;

    const description = rp.p_details_en || rp.p_desc_en || rp.p_name_en;
    const shortDescription = rp.p_desc_en ? rp.p_desc_en.slice(0, 300) : null;

    let localProduct;
    if (existingProduct) {
      localProduct = await prisma.products.update({
        where: { id: existingProduct.id },
        data: {
          name: rp.p_name_en,
          description,
          short_description: shortDescription,
          seo_title: rp.seo_title || rp.p_name_en,
          seo_description: rp.seo_description || shortDescription,
          seo_keywords: rp.seo_keywords,
          status: rp.p_status === 1 ? 'PUBLISHED' : 'DRAFT',
          is_featured: rp.is_featured === 1,
          published_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        },
      });
    } else {
      localProduct = await prisma.products.create({
        data: {
          name: rp.p_name_en,
          slug,
          product_number: productNumber,
          description,
          short_description: shortDescription,
          seo_title: rp.seo_title || rp.p_name_en,
          seo_description: rp.seo_description || shortDescription,
          seo_keywords: rp.seo_keywords,
          status: rp.p_status === 1 ? 'PUBLISHED' : 'DRAFT',
          is_featured: rp.is_featured === 1,
          published_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        },
      });
    }

    // Link product categories
    const catIds = prodCatMap.get(rp.p_id) || [];
    for (const remoteCatId of catIds) {
      const localCatId = categoryMap.get(remoteCatId);
      if (localCatId) {
        await prisma.product_categories.upsert({
          where: { product_id_category_id: { product_id: localProduct.id, category_id: localCatId } },
          update: {},
          create: { product_id: localProduct.id, category_id: localCatId },
        });
      }
    }

    // Collect all images (product_image + color_image)
    const imagesList = [];
    const pImages = prodImageMap.get(rp.p_id) || [];
    for (const pi of pImages) {
      if (pi.pi_image) {
        imagesList.push({
          url: getFullMediaUrl(pi.pi_image),
          alt: pi.alt_text || rp.p_name_en,
        });
      }
    }

    const cImages = prodColorImageMap.get(rp.p_id) || [];
    for (const ci of cImages) {
      if (ci.image) {
        imagesList.push({
          url: getFullMediaUrl(ci.image),
          alt: ci.alt_text || rp.p_name_en,
        });
      }
    }

    // Deduplicate images
    const seenUrls = new Set();
    let imgOrder = 0;
    for (const img of imagesList) {
      if (!img.url || seenUrls.has(img.url)) continue;
      seenUrls.add(img.url);

      const existingImg = await prisma.product_images.findFirst({
        where: { product_id: localProduct.id, image_url: img.url },
      });

      if (!existingImg) {
        await prisma.product_images.create({
          data: {
            product_id: localProduct.id,
            image_url: img.url,
            alt_text: img.alt,
            sort_order: imgOrder,
            is_thumbnail: imgOrder === 0,
          },
        });
      }
      imgOrder++;
    }

    // Handle Variants
    const vpList = prodVariantMap.get(rp.p_id) || [];
    const pSizes = prodSizeMap.get(rp.p_id) || [];
    const pColors = prodColorMap.get(rp.p_id) || [];
    const stockTotal = prodInventoryMap.get(rp.p_id) || 50;

    const baseVp = vpList[0] || {};
    const price = parseFloat(baseVp.price || '550.00');
    let comparePrice = null;
    if (baseVp.discount && parseFloat(baseVp.discount) > 0) {
      const discountVal = parseFloat(baseVp.discount);
      if (baseVp.discount_type === 'percentage') {
        comparePrice = Math.round((price / (1 - discountVal / 100)) * 100) / 100;
      } else {
        comparePrice = price + discountVal;
      }
    }

    const sizesToUse = pSizes.length > 0 ? pSizes : [null];
    const colorsToUse = pColors.length > 0 ? pColors : [null];

    let vIdx = 1;
    const totalCombos = sizesToUse.length * colorsToUse.length;
    const stockPerVariant = Math.max(5, Math.floor(stockTotal / (totalCombos || 1)));

    for (const sId of sizesToUse) {
      for (const cId of colorsToUse) {
        const sku = `${localProduct.product_number || 'P' + rp.p_id}-S${sId || 0}-C${cId || 0}`;

        let variant = await prisma.product_variants.findUnique({ where: { sku } });
        if (!variant) {
          variant = await prisma.product_variants.create({
            data: {
              product_id: localProduct.id,
              sku,
              price,
              compare_price: comparePrice,
              status: 'ACTIVE',
            },
          });
        } else {
          await prisma.product_variants.update({
            where: { id: variant.id },
            data: {
              price,
              compare_price: comparePrice,
              status: 'ACTIVE',
            },
          });
        }

        // Link Size attribute value
        if (sId && sizeMap.has(sId)) {
          const valId = sizeMap.get(sId);
          await prisma.variant_attribute_values.upsert({
            where: { variant_id_attribute_value_id: { variant_id: variant.id, attribute_value_id: valId } },
            update: {},
            create: { variant_id: variant.id, attribute_value_id: valId },
          });
        }

        // Link Color attribute value
        if (cId && colorMap.has(cId)) {
          const valId = colorMap.get(cId);
          await prisma.variant_attribute_values.upsert({
            where: { variant_id_attribute_value_id: { variant_id: variant.id, attribute_value_id: valId } },
            update: {},
            create: { variant_id: variant.id, attribute_value_id: valId },
          });
        }

        // Link Fabric attribute value if specified on variant
        if (baseVp.fabric_id && fabricMap.has(baseVp.fabric_id)) {
          const valId = fabricMap.get(baseVp.fabric_id);
          await prisma.variant_attribute_values.upsert({
            where: { variant_id_attribute_value_id: { variant_id: variant.id, attribute_value_id: valId } },
            update: {},
            create: { variant_id: variant.id, attribute_value_id: valId },
          });
        }

        // Create or update inventory
        await prisma.inventory.upsert({
          where: { variant_id_warehouse_id: { variant_id: variant.id, warehouse_id: defaultWarehouse.id } },
          update: {
            quantity: stockPerVariant,
            available_quantity: stockPerVariant,
          },
          create: {
            variant_id: variant.id,
            warehouse_id: defaultWarehouse.id,
            quantity: stockPerVariant,
            available_quantity: stockPerVariant,
          },
        });
        vIdx++;
      }
    }

    console.log(`  ✓ Product [${rp.p_id}]: "${rp.p_name_en}" -> ${imgOrder} images, ${vIdx - 1} variants`);
  }

  // =========================================================================
  // 4. MIGRATE BANNERS
  // =========================================================================
  console.log('\n--- 4. Migrating Homepage Banners ---');
  const [remoteBanners] = await mysqlConn.query('SELECT * FROM banner');
  for (const rb of remoteBanners) {
    const imageUrl = getFullMediaUrl(rb.image);
    const mobileImageUrl = getFullMediaUrl(rb.small_image);

    const existingBanner = await prisma.banners.findFirst({
      where: { title: rb.title_en },
    });

    if (existingBanner) {
      await prisma.banners.update({
        where: { id: existingBanner.id },
        data: {
          subtitle: rb.description_en,
          cta_text: rb.button_name_en || 'Shop Now',
          cta_link: rb.link || '/catalog',
          image_url: imageUrl,
          mobile_image_url: mobileImageUrl,
          alt_text: rb.alt_text || rb.title_en,
          is_active: rb.status === 1,
        },
      });
    } else {
      await prisma.banners.create({
        data: {
          title: rb.title_en,
          subtitle: rb.description_en,
          cta_text: rb.button_name_en || 'Shop Now',
          cta_link: rb.link || '/catalog',
          image_url: imageUrl,
          mobile_image_url: mobileImageUrl,
          alt_text: rb.alt_text || rb.title_en,
          size_type: 'HERO',
          is_active: rb.status === 1,
        },
      });
    }
    console.log(`  ✓ Banner: "${rb.title_en}"`);
  }

  // =========================================================================
  // 5. MIGRATE WEBSITE SETTINGS
  // =========================================================================
  console.log('\n--- 5. Migrating Website Settings ---');
  const [remoteSettings] = await mysqlConn.query('SELECT * FROM website_settings LIMIT 1');
  if (remoteSettings && remoteSettings[0]) {
    const ws = remoteSettings[0];
    const settingsToUpsert = [
      { key: 'logo_url', value: getFullMediaUrl(ws.logo) },
      { key: 'favicon_url', value: getFullMediaUrl(ws.favicon) },
      { key: 'footer_logo_url', value: getFullMediaUrl(ws.footer_logo) },
      { key: 'footer_about_text', value: ws.footer_text_en },
      { key: 'seo_title', value: ws.og_title || 'Saba Al Wadi Dubai' },
      { key: 'seo_description', value: ws.description || ws.og_description },
      { key: 'seo_keywords', value: ws.keywords },
    ];

    if (ws.social_links) {
      try {
        const parsedSocial = typeof ws.social_links === 'string' ? JSON.parse(ws.social_links) : ws.social_links;
        for (const s of parsedSocial) {
          if (s.link && s.link.includes('facebook')) settingsToUpsert.push({ key: 'social_facebook', value: s.link });
          if (s.link && s.link.includes('instagram')) settingsToUpsert.push({ key: 'social_instagram', value: s.link });
          if (s.link && s.link.includes('youtube')) settingsToUpsert.push({ key: 'social_youtube', value: s.link });
          if (s.link && s.link.includes('tiktok')) settingsToUpsert.push({ key: 'social_tiktok', value: s.link });
          if (s.link && s.link.includes('pinterest')) settingsToUpsert.push({ key: 'social_pinterest', value: s.link });
        }
      } catch (_) {}
    }

    for (const item of settingsToUpsert) {
      if (item.value) {
        await prisma.site_settings.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        });
      }
    }
    console.log(`  ✓ Synced website settings: logo, favicon, SEO & social links`);
  }

  // =========================================================================
  // 6. MIGRATE BLOGS
  // =========================================================================
  console.log('\n--- 6. Migrating Blogs ---');
  const [remoteBlogs] = await mysqlConn.query('SELECT * FROM blogs');
  const [remoteBlogMedia] = await mysqlConn.query('SELECT * FROM blog_media');
  const blogMediaMap = new Map();
  for (const bm of remoteBlogMedia) {
    blogMediaMap.set(bm.id, getFullMediaUrl(bm.filename));
  }

  for (const rb of remoteBlogs) {
    const slug = rb.slug || rb.title_en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const featuredImg = blogMediaMap.get(rb.featured_image_id) || null;

    await prisma.blogs.upsert({
      where: { slug },
      update: {
        title: rb.title_en,
        excerpt: rb.meta_description_en || rb.title_en,
        content: rb.meta_description_en || rb.title_en,
        featured_image: featuredImg,
        views: rb.views || 0,
        is_published: rb.status === 1,
        published_at: rb.created_at ? new Date(rb.created_at) : new Date(),
      },
      create: {
        title: rb.title_en,
        slug,
        excerpt: rb.meta_description_en || rb.title_en,
        content: rb.meta_description_en || rb.title_en,
        featured_image: featuredImg,
        views: rb.views || 0,
        is_published: rb.status === 1,
        published_at: rb.created_at ? new Date(rb.created_at) : new Date(),
      },
    });
    console.log(`  ✓ Blog: "${rb.title_en}"`);
  }

  // =========================================================================
  // 7. MIGRATE COUPONS
  // =========================================================================
  console.log('\n--- 7. Migrating Coupons ---');
  const [remoteCoupons] = await mysqlConn.query('SELECT * FROM coupons');
  for (const rc of remoteCoupons) {
    await prisma.coupons.upsert({
      where: { code: rc.coupon_code },
      update: {
        discount_type: rc.discount_type === 'percentage' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
        discount_value: parseFloat(rc.discount || '10'),
        start_date: rc.start_date ? new Date(rc.start_date) : new Date(),
        end_date: rc.end_date ? new Date(rc.end_date) : new Date(Date.now() + 365 * 86400000),
        status: rc.status === 1,
      },
      create: {
        code: rc.coupon_code,
        discount_type: rc.discount_type === 'percentage' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
        discount_value: parseFloat(rc.discount || '10'),
        start_date: rc.start_date ? new Date(rc.start_date) : new Date(),
        end_date: rc.end_date ? new Date(rc.end_date) : new Date(Date.now() + 365 * 86400000),
        status: rc.status === 1,
      },
    });
    console.log(`  ✓ Coupon: "${rc.coupon_code}" (${rc.discount_type})`);
  }

  await mysqlConn.end();
  console.log('\n🎉 ALL REMOTE DATA SUCCESSFULLY MIGRATED TO CURRENT POSTGRESQL DATABASE!');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

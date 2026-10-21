const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Current backend serving files from /uploads
const CURRENT_BACKEND_MEDIA_ROOT = 'https://webserver.sabaalwadi.com/uploads/';

/**
 * Normalizes any media path or legacy URL to the current backend URL
 */
function getFullMediaUrl(path) {
  if (!path) return null;
  const str = String(path).trim();
  if (!str) return null;

  // If already pointing to the new backend, return it
  if (str.startsWith('https://webserver.sabaalwadi.com/uploads/')) {
    return str;
  }

  // If pointing to old media server or other variations of media.sabaalwadi.com
  if (str.includes('media.sabaalwadi.com')) {
    const cleaned = str
      .replace(/https?:\/\/media\.sabaalwadi\.com\/saba-media\//g, '')
      .replace(/https?:\/\/media\.sabaalwadi\.com\//g, '')
      .replace(/^\/+/, '');
    return `${CURRENT_BACKEND_MEDIA_ROOT}${cleaned}`;
  }

  // If it's a 3rd party URL (e.g. Unsplash, Cloudinary, AWS S3), keep it as is
  if (str.startsWith('http://') || str.startsWith('https://')) {
    if (str.includes('webserver.sabaalwadi.com')) {
      return str;
    }
    return str;
  }

  // Relative path (e.g. 'product_files/xxx.webp', 'product_category/yyy.webp')
  const cleanPath = str.replace(/^\/+/, '').replace(/^saba-media\//, '');
  return `${CURRENT_BACKEND_MEDIA_ROOT}${cleanPath}`;
}

/**
 * Replaces old media domain in rich HTML / markdown text
 */
function updateContentUrls(text) {
  if (!text) return text;
  return text
    .replace(/https?:\/\/media\.sabaalwadi\.com\/saba-media\//g, CURRENT_BACKEND_MEDIA_ROOT)
    .replace(/https?:\/\/media\.sabaalwadi\.com\//g, CURRENT_BACKEND_MEDIA_ROOT);
}

async function connectMySQLWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to old MySQL (72.60.99.32:3306) attempt ${i + 1}/${retries}...`);
      const conn = await mysql.createConnection({
        host: '72.60.99.32',
        port: 3306,
        user: 'root',
        password: '@saba2025@',
        database: 'saba-ecom',
        connectTimeout: 25000,
      });
      return conn;
    } catch (err) {
      console.warn(`Connection attempt ${i + 1} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 STARTING COMPREHENSIVE MIGRATION: MySQL -> PostgreSQL');
  console.log(`   Source DB:  MySQL 72.60.99.32:3306 (saba-ecom)`);
  console.log(`   Target DB:  PostgreSQL 72.60.99.32:5432 (saba)`);
  console.log(`   Media Root: ${CURRENT_BACKEND_MEDIA_ROOT}`);
  console.log('================================================================\n');

  const mysqlConn = await connectMySQLWithRetry();
  console.log('✓ Successfully connected to old MySQL database!\n');

  // =========================================================================
  // 1. WAREHOUSE
  // =========================================================================
  console.log('--- 1. Migrating Warehouse ---');
  const [remoteWarehouses] = await mysqlConn.query('SELECT * FROM warehouse');
  let defaultWarehouse = null;

  for (const rw of remoteWarehouses) {
    const name = rw.w_name || 'Saba Al Wadi Warehouse';
    const location = rw.w_address || 'Dubai, UAE';
    defaultWarehouse = await prisma.warehouses.upsert({
      where: { id: 'default-warehouse-uae' },
      update: { name, location },
      create: { id: 'default-warehouse-uae', name, location },
    });
    console.log(`  ✓ Warehouse: "${name}" (${defaultWarehouse.id})`);
  }

  if (!defaultWarehouse) {
    defaultWarehouse = await prisma.warehouses.create({
      data: {
        id: 'default-warehouse-uae',
        name: 'Saba Al Wadi Main Warehouse',
        location: 'Dubai, UAE',
      },
    });
  }

  // =========================================================================
  // 2. CATEGORIES
  // =========================================================================
  console.log('\n--- 2. Migrating Categories ---');
  const [remoteCategories] = await mysqlConn.query('SELECT * FROM category');
  console.log(`Found ${remoteCategories.length} categories on MySQL.`);

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
    console.log(`  ✓ Category: "${rc.cate_name_en}" (slug: ${localCat.slug})`);
  }

  // =========================================================================
  // 3. ATTRIBUTES & ATTRIBUTE VALUES (Color, Size, Fabric)
  // =========================================================================
  console.log('\n--- 3. Migrating Attributes (Color, Size, Fabric) ---');

  // Attribute 1: Color
  let colorAttr = await prisma.attributes.upsert({
    where: { name: 'Color' },
    update: {},
    create: { name: 'Color' },
  });

  // Attribute 2: Size
  let sizeAttr = await prisma.attributes.upsert({
    where: { name: 'Size' },
    update: {},
    create: { name: 'Size' },
  });

  // Attribute 3: Fabric
  let fabricAttr = await prisma.attributes.upsert({
    where: { name: 'Fabric' },
    update: {},
    create: { name: 'Fabric' },
  });

  // Colors
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
  console.log(`  ✓ Synced ${remoteColors.length} Color attribute values.`);

  // Sizes
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
  console.log(`  ✓ Synced ${remoteSizes.length} Size attribute values.`);

  // Fabrics
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
  console.log(`  ✓ Synced ${remoteFabrics.length} Fabric attribute values.`);

  // =========================================================================
  // 4. PRODUCTS, IMAGES, VARIANTS, & INVENTORY
  // =========================================================================
  console.log('\n--- 4. Migrating Products, Images, Variants & Inventory ---');
  const [remoteProducts] = await mysqlConn.query('SELECT * FROM product ORDER BY p_id ASC');
  console.log(`Found ${remoteProducts.length} products on remote MySQL.`);

  // Fetch product_category joins
  const [remoteProdCats] = await mysqlConn.query('SELECT * FROM product_category');
  const prodCatMap = new Map();
  for (const pc of remoteProdCats) {
    if (!prodCatMap.has(pc.pc_p_id)) prodCatMap.set(pc.pc_p_id, []);
    prodCatMap.get(pc.pc_p_id).push(pc.pc_cate_id);
  }

  // Fetch product_images
  const [remoteImages] = await mysqlConn.query('SELECT * FROM product_image');
  const prodImageMap = new Map();
  for (const pi of remoteImages) {
    if (!prodImageMap.has(pi.pi_p_id)) prodImageMap.set(pi.pi_p_id, []);
    prodImageMap.get(pi.pi_p_id).push(pi);
  }

  // Fetch color_images
  const [remoteColorImages] = await mysqlConn.query('SELECT * FROM color_image');
  const prodColorImageMap = new Map();
  for (const ci of remoteColorImages) {
    if (!prodColorImageMap.has(ci.p_id)) prodColorImageMap.set(ci.p_id, []);
    prodColorImageMap.get(ci.p_id).push(ci);
  }

  // Fetch variant_product
  const [remoteVariants] = await mysqlConn.query('SELECT * FROM variant_product');
  const prodVariantMap = new Map();
  for (const vp of remoteVariants) {
    if (!prodVariantMap.has(vp.p_id)) prodVariantMap.set(vp.p_id, []);
    prodVariantMap.get(vp.p_id).push(vp);
  }

  // Fetch p_size
  const [remoteProductSizes] = await mysqlConn.query('SELECT * FROM p_size');
  const prodSizeMap = new Map();
  for (const ps of remoteProductSizes) {
    if (!prodSizeMap.has(ps.p_id)) prodSizeMap.set(ps.p_id, []);
    prodSizeMap.get(ps.p_id).push(ps.size_id);
  }

  // Fetch p_color
  const [remoteProductColors] = await mysqlConn.query('SELECT * FROM p_color');
  const prodColorMap = new Map();
  for (const pc of remoteProductColors) {
    if (!prodColorMap.has(pc.p_id)) prodColorMap.set(pc.p_id, []);
    prodColorMap.get(pc.p_id).push(pc.color_id);
  }

  // Fetch inventory
  const [remoteInventory] = await mysqlConn.query('SELECT * FROM inventory');
  const prodInventoryMap = new Map();
  for (const inv of remoteInventory) {
    prodInventoryMap.set(inv.i_p_id, inv.i_quantity_available);
  }

  let productSeq = 1000;
  let totalProductsMigrated = 0;
  let totalImagesMigrated = 0;
  let totalVariantsMigrated = 0;

  for (const rp of remoteProducts) {
    const slug = rp.p_slug || (rp.p_name_en || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const productNumber = rp.product_no || `P${productSeq++}`;

    const description = updateContentUrls(rp.p_details_en || rp.p_desc_en || rp.p_name_en || 'No description');
    const shortDescription = rp.p_desc_en ? rp.p_desc_en.slice(0, 300) : null;

    const localProduct = await prisma.products.upsert({
      where: { slug },
      update: {
        product_number: productNumber,
        name: rp.p_name_en,
        description,
        short_description: shortDescription,
        tags: rp.p_tags,
        seo_title: rp.seo_title || rp.p_name_en,
        seo_description: rp.seo_description || shortDescription,
        seo_keywords: rp.seo_keywords,
        status: rp.p_status === 1 ? 'PUBLISHED' : 'DRAFT',
        is_featured: rp.is_featured === 1,
        published_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        created_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        updated_at: rp.p_updated_at ? new Date(rp.p_updated_at) : new Date(),
      },
      create: {
        slug,
        product_number: productNumber,
        name: rp.p_name_en,
        description,
        short_description: shortDescription,
        tags: rp.p_tags,
        seo_title: rp.seo_title || rp.p_name_en,
        seo_description: rp.seo_description || shortDescription,
        seo_keywords: rp.seo_keywords,
        status: rp.p_status === 1 ? 'PUBLISHED' : 'DRAFT',
        is_featured: rp.is_featured === 1,
        published_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        created_at: rp.p_created_at ? new Date(rp.p_created_at) : new Date(),
        updated_at: rp.p_updated_at ? new Date(rp.p_updated_at) : new Date(),
      },
    });

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

    // Process Product Images (from product_image & color_image)
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
      } else {
        await prisma.product_images.update({
          where: { id: existingImg.id },
          data: {
            sort_order: imgOrder,
            is_thumbnail: imgOrder === 0,
          },
        });
      }
      imgOrder++;
      totalImagesMigrated++;
    }

    // Process Variants
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
    const totalCombos = sizesToUse.length * colorsToUse.length;
    const stockPerVariant = Math.max(5, Math.floor(stockTotal / (totalCombos || 1)));

    let vIdx = 0;
    for (const sId of sizesToUse) {
      for (const cId of colorsToUse) {
        const sku = `${localProduct.product_number || 'P' + rp.p_id}-S${sId || 0}-C${cId || 0}`;

        const variant = await prisma.product_variants.upsert({
          where: { sku },
          update: {
            price,
            compare_price: comparePrice,
            status: 'ACTIVE',
          },
          create: {
            product_id: localProduct.id,
            sku,
            price,
            compare_price: comparePrice,
            status: 'ACTIVE',
          },
        });

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
        totalVariantsMigrated++;
      }
    }

    totalProductsMigrated++;
    console.log(`  ✓ [${totalProductsMigrated}/${remoteProducts.length}] Product: "${rp.p_name_en}" -> ${imgOrder} images, ${vIdx} variants`);
  }

  // =========================================================================
  // 5. BANNERS
  // =========================================================================
  console.log('\n--- 5. Migrating Homepage Banners ---');
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
  // 6. WEBSITE SETTINGS
  // =========================================================================
  console.log('\n--- 6. Migrating Website Settings ---');
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
  // 7. BLOGS & COMMENTS
  // =========================================================================
  console.log('\n--- 7. Migrating Blogs & Comments ---');
  const [remoteBlogCats] = await mysqlConn.query('SELECT * FROM blog_categories');
  const blogCatMap = new Map();
  for (const c of remoteBlogCats) {
    blogCatMap.set(c.id, c.name_en || 'Abaya');
  }

  const [remoteBlogMedia] = await mysqlConn.query('SELECT * FROM blog_media');
  const blogMediaMap = new Map();
  for (const bm of remoteBlogMedia) {
    if (bm.filename) {
      blogMediaMap.set(bm.id, getFullMediaUrl(bm.filename));
    }
  }

  const [remoteBlogs] = await mysqlConn.query('SELECT * FROM blogs ORDER BY id ASC');
  console.log(`Found ${remoteBlogs.length} blogs on MySQL.`);

  let migratedBlogs = 0;
  for (const rb of remoteBlogs) {
    const slug = rb.slug || (rb.title_en || 'blog').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const featuredImg = blogMediaMap.get(rb.featured_image_id) || null;
    const categoryName = blogCatMap.get(rb.category_id) || 'Abaya';
    const content = updateContentUrls(rb.content_en || rb.content_ar || '<p>Content coming soon...</p>');
    const excerpt = rb.meta_description_en || (content ? content.replace(/<[^>]+>/g, '').slice(0, 190) + '...' : null);

    await prisma.blogs.upsert({
      where: { slug },
      update: {
        title: rb.title_en,
        excerpt,
        content,
        featured_image: featuredImg,
        main_image: featuredImg,
        category: categoryName,
        views: Math.max(Number(rb.views) || 0, 50),
        is_published: rb.status === 1,
        published_at: rb.created_at ? new Date(rb.created_at) : new Date(),
        author: 'Saba Al Wadi',
      },
      create: {
        title: rb.title_en,
        slug,
        excerpt,
        content,
        featured_image: featuredImg,
        main_image: featuredImg,
        category: categoryName,
        views: Math.max(Number(rb.views) || 0, 50),
        is_published: rb.status === 1,
        published_at: rb.created_at ? new Date(rb.created_at) : new Date(),
        author: 'Saba Al Wadi',
      },
    });
    migratedBlogs++;
    console.log(`  ✓ Blog [${migratedBlogs}/${remoteBlogs.length}]: "${rb.title_en.slice(0, 45)}..."`);
  }

  // Blog comments
  const [remoteComments] = await mysqlConn.query('SELECT * FROM blog_comments');
  for (const rc of remoteComments) {
    const targetBlog = remoteBlogs.find(b => b.id === rc.blog_id);
    if (!targetBlog) continue;
    const localBlog = await prisma.blogs.findUnique({ where: { slug: targetBlog.slug } });
    if (!localBlog) continue;

    await prisma.blog_comments.create({
      data: {
        blog_id: localBlog.id,
        author_name: rc.name || 'Customer',
        author_email: rc.email || 'customer@example.com',
        content: rc.comment || '',
        status: rc.status === 1 ? 'APPROVED' : 'PENDING',
        created_at: rc.created_at ? new Date(rc.created_at) : new Date(),
      },
    });
  }
  console.log(`  ✓ Synced ${remoteComments.length} blog comments.`);

  // =========================================================================
  // 8. COUPONS
  // =========================================================================
  console.log('\n--- 8. Migrating Coupons ---');
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
    console.log(`  ✓ Coupon: "${rc.coupon_code}"`);
  }

  // =========================================================================
  // 9. CUSTOMERS & ADDRESSES
  // =========================================================================
  console.log('\n--- 9. Migrating Customers & Shipping Addresses ---');
  const [remoteCustomers] = await mysqlConn.query('SELECT * FROM e_customer');
  const [remoteAddresses] = await mysqlConn.query('SELECT * FROM ec_shipping_address');

  const customerMap = new Map(); // ec_id -> local customer.id

  for (const ec of remoteCustomers) {
    const email = (ec.ec_email || `customer_${ec.ec_id}@sabaalwadi.com`).toLowerCase().trim();
    const parts = (ec.ec_name || 'Customer User').trim().split(/\s+/);
    const firstName = parts[0] || 'Customer';
    const lastName = parts.slice(1).join(' ') || 'User';
    const avatarUrl = getFullMediaUrl(ec.ec_image);

    const localCustomer = await prisma.customers.upsert({
      where: { email },
      update: {
        first_name: firstName,
        last_name: lastName,
        phone: ec.ec_phone,
        password: ec.ec_password,
        avatar_url: avatarUrl,
        email_verified: ec.ec_status === 1,
      },
      create: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: ec.ec_phone,
        password: ec.ec_password,
        avatar_url: avatarUrl,
        email_verified: ec.ec_status === 1,
        created_at: ec.ec_created_at ? new Date(ec.ec_created_at) : new Date(),
        updated_at: ec.ec_updated_at ? new Date(ec.ec_updated_at) : new Date(),
      },
    });

    customerMap.set(ec.ec_id, localCustomer.id);
    console.log(`  ✓ Customer: "${firstName} ${lastName}" (${email})`);
  }

  // Customer addresses
  for (const addr of remoteAddresses) {
    const localCustId = customerMap.get(addr.ec_id);
    if (!localCustId) continue;

    const id = require('crypto').randomUUID();
    const city = addr.city || 'Dubai';
    const area = addr.state || addr.city || 'Dubai';
    const street = addr.street_address || addr.apt || 'Main Street';
    const building = addr.apt || null;
    const postalCode = addr.zip_code || null;
    const country = 'United Arab Emirates';
    const isDefault = addr.is_default === 1;

    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO customer_addresses (id, customer_id, country, city, area, street, building, postal_code, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
      `, id, localCustId, country, city, area, street, building, postalCode, isDefault);
    } catch (err) {
      console.warn(`Address insert notice: ${err.message}`);
    }
  }
  console.log(`  ✓ Synced ${remoteAddresses.length} customer addresses.`);

  await mysqlConn.end();
  await prisma.$disconnect();

  console.log('\n================================================================');
  console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
  console.log(`   Products migrated:   ${totalProductsMigrated}`);
  console.log(`   Images migrated:     ${totalImagesMigrated}`);
  console.log(`   Variants migrated:   ${totalVariantsMigrated}`);
  console.log(`   Categories migrated: ${remoteCategories.length}`);
  console.log(`   Colors:              ${remoteColors.length}`);
  console.log(`   Sizes:               ${remoteSizes.length}`);
  console.log(`   Fabrics:             ${remoteFabrics.length}`);
  console.log(`   Blogs migrated:      ${migratedBlogs}`);
  console.log(`   Coupons migrated:    ${remoteCoupons.length}`);
  console.log(`   Customers migrated:  ${remoteCustomers.length}`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ MIGRATION FAILED:', err);
  process.exit(1);
});

import { PrismaClient, product_status, variant_status } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding 20 premium abaya products into database...');

  // 1. Ensure warehouse exists
  let warehouse = await prisma.warehouses.findFirst();
  if (!warehouse) {
    warehouse = await prisma.warehouses.create({
      data: {
        name: 'Dubai Luxury Flagship Warehouse',
        location: 'Downtown Dubai, UAE',
      },
    });
  }

  // 2. Ensure categories exist
  let mainAbaya = await prisma.categories.findFirst({ where: { slug: 'abaya' } });
  if (!mainAbaya) {
    mainAbaya = await prisma.categories.create({
      data: {
        name: 'Abayas',
        slug: 'abaya',
        description: 'Exquisite haute couture & daily modest abayas',
        is_active: true,
        show_in_navbar: true,
        show_on_homepage: true,
        sort_order: 1,
      },
    });
  }

  const subCategoriesData = [
    { name: 'Luxury Abayas', slug: 'luxury-abayas', desc: 'Handcrafted luxury abayas with Swarovski and pearl embellishments', showNav: true, showHome: true, sort: 1 },
    { name: 'Casual Daily Abayas', slug: 'casual-abayas', desc: 'Lightweight, breathable linen and crepe for daily elegance', showNav: true, showHome: true, sort: 2 },
    { name: 'Open Abayas & Kimonos', slug: 'open-abayas', desc: 'Modern open-front flowing silhouettes and layered abayas', showNav: true, showHome: true, sort: 3 },
    { name: 'Eid & Festive Couture', slug: 'eid-collection', desc: 'Regal festive ensembles for special celebrations', showNav: true, showHome: true, sort: 4 },
    { name: 'Silk & Velvet Abayas', slug: 'silk-velvet', desc: 'Rich Japanese raw silk and royal plush velvet abayas', showNav: true, showHome: true, sort: 5 },
    { name: 'Bridal Modest Abayas', slug: 'bridal-abayas', desc: 'Opulent white and ivory bridal wear with delicate lace', showNav: false, showHome: true, sort: 6 },
    { name: 'Shaylas & Hijabs', slug: 'shaylas-hijabs', desc: 'Matching luxury chiffon, georgette, and modal scarves', showNav: true, showHome: true, sort: 7 },
  ];

  const categoryMap = new Map<string, string>();
  categoryMap.set('abaya', mainAbaya.id);

  for (const c of subCategoriesData) {
    let cat = await prisma.categories.findFirst({ where: { slug: c.slug } });
    if (!cat) {
      cat = await prisma.categories.create({
        data: {
          name: c.name,
          slug: c.slug,
          description: c.desc,
          parent_id: mainAbaya.id,
          is_active: true,
          show_in_navbar: c.showNav,
          show_on_homepage: c.showHome,
          sort_order: c.sort,
          image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80',
        },
      });
    } else {
      await prisma.categories.update({
        where: { id: cat.id },
        data: {
          show_in_navbar: c.showNav,
          show_on_homepage: c.showHome,
        },
      });
    }
    categoryMap.set(c.slug, cat.id);
  }

  // 3. Ensure attributes exist (Color, Size, Fabric)
  let colorAttr = await prisma.attributes.findFirst({ where: { name: 'Color' } });
  if (!colorAttr) {
    colorAttr = await prisma.attributes.create({ data: { name: 'Color' } });
  }

  let sizeAttr = await prisma.attributes.findFirst({ where: { name: 'Size' } });
  if (!sizeAttr) {
    sizeAttr = await prisma.attributes.create({ data: { name: 'Size' } });
  }

  let fabricAttr = await prisma.attributes.findFirst({ where: { name: 'Fabric' } });
  if (!fabricAttr) {
    fabricAttr = await prisma.attributes.create({ data: { name: 'Fabric' } });
  }

  const ensureAttrVal = async (attrId: string, val: string) => {
    let row = await prisma.attribute_values.findFirst({
      where: { attribute_id: attrId, value: val },
    });
    if (!row) {
      row = await prisma.attribute_values.create({
        data: { attribute_id: attrId, value: val },
      });
    }
    return row.id;
  };

  const cBlack = await ensureAttrVal(colorAttr.id, 'Midnight Black');
  const cEmerald = await ensureAttrVal(colorAttr.id, 'Emerald Forest');
  const cChampagne = await ensureAttrVal(colorAttr.id, 'Champagne Gold');
  const cDustyRose = await ensureAttrVal(colorAttr.id, 'Dusty Rose');
  const cNavy = await ensureAttrVal(colorAttr.id, 'Royal Navy');

  const s52 = await ensureAttrVal(sizeAttr.id, '52');
  const s54 = await ensureAttrVal(sizeAttr.id, '54');
  const s56 = await ensureAttrVal(sizeAttr.id, '56');
  const s58 = await ensureAttrVal(sizeAttr.id, '58');

  const fNida = await ensureAttrVal(fabricAttr.id, 'Korean Nida');
  const fSilk = await ensureAttrVal(fabricAttr.id, 'Pure Mulberry Silk');
  const fLinen = await ensureAttrVal(fabricAttr.id, 'Organic Italian Linen');
  const fVelvet = await ensureAttrVal(fabricAttr.id, 'Royal Plush Velvet');
  const fCrepe = await ensureAttrVal(fabricAttr.id, 'Japanese Georgette Crepe');

  // Find flash sale offer if exists, or create one
  let flashOffer = await prisma.offers.findFirst({ where: { status: 'ACTIVE' } });
  if (!flashOffer) {
    flashOffer = await prisma.offers.create({
      data: {
        name: 'Flash Sale Exclusive 25% Off',
        type: 'FLASH_SALE',
        priority: 100,
        discount_type: 'PERCENTAGE',
        discount_value: 25,
        start_date: new Date(),
        end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        status: 'ACTIVE',
      },
    });
  }

  // 20 realistic luxury modest fashion abayas
  const catalog = [
    {
      name: 'Noor Al Ayn Hand-Beaded Black Abaya',
      slug: 'noor-al-ayn-hand-beaded-black-abaya',
      desc: 'An opulent masterpiece crafted from premium Korean Nida featuring delicate hand-embroidery with metallic bugle beads along the bell sleeves and front hem. Drapes gracefully with a subtle sheen suited for gala dinners and prestigious occasions.',
      shortDesc: 'Regal Korean Nida with hand-beaded metallic embroidery on flared sleeves.',
      price: 680,
      comparePrice: 850,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Zahra Royal Velvet Emerald Abaya',
      slug: 'zahra-royal-velvet-emerald-abaya',
      desc: 'Woven from lush, heavyweight royal velvet in a deep jewel emerald tone. Features intricate gold zari cord embroidery on the collar and cuffs with discreet snap-button closures.',
      shortDesc: 'Deep jewel emerald velvet with artisanal gold zari cord work.',
      price: 890,
      comparePrice: 1100,
      catSlug: 'silk-velvet',
      images: [
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cEmerald,
      fabric: fVelvet,
    },
    {
      name: 'Sultana Pure Raw Silk Champagne Abaya',
      slug: 'sultana-pure-raw-silk-champagne-abaya',
      desc: 'Exquisite mulberry raw silk with a natural slub texture and luminous pearl sheen. Designed in a relaxed fluid silhouette with tailored French seams and matching silk shayla included.',
      shortDesc: 'Pure Japanese raw silk tailored with minimalist French seams.',
      price: 950,
      comparePrice: 1200,
      catSlug: 'silk-velvet',
      images: [
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fSilk,
    },
    {
      name: 'Layla Minimalist Breathable Linen Abaya',
      slug: 'layla-minimalist-breathable-linen-abaya',
      desc: 'Effortless everyday sophistication crafted from 100% pre-washed Italian linen. Naturally thermoregulating for the warm Gulf climate, featuring deep side pockets and rolled tab sleeves.',
      shortDesc: 'Pre-washed Italian organic linen tailored for daily Gulf climate comfort.',
      price: 390,
      comparePrice: 480,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cDustyRose,
      fabric: fLinen,
    },
    {
      name: 'Qamar Pleated Chiffon Overlay Open Abaya',
      slug: 'qamar-pleated-chiffon-overlay-open-abaya',
      desc: 'Airy double-georgette with micro-accordion pleating on back panel and sleeves. Floats effortlessly as you move, designed to be worn over matching inner slips or trouser sets.',
      shortDesc: 'Airy layered double georgette with micro-accordion sunburst pleating.',
      price: 520,
      comparePrice: 650,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fCrepe,
    },
    {
      name: 'Thuraya Eid Festive Gold Filigree Abaya',
      slug: 'thuraya-eid-festive-gold-filigree-abaya',
      desc: 'Specially created for celebratory gatherings and Eid ceremonies. Accentuated by fine golden corded filigree along the lapel and sleeve hems on jet-black premium crepe.',
      shortDesc: 'Festive ceremonial abaya with shimmering gold filigree cord embroidery.',
      price: 740,
      comparePrice: 920,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fCrepe,
    },
    {
      name: 'Amina Kimono Sleeve Satin Trim Abaya',
      slug: 'amina-kimono-sleeve-satin-trim-abaya',
      desc: 'Wide kimono sleeve design edged with tonal duchess satin piping. Contemporary modern cut that transitions effortlessly from business meetings to twilight dinners.',
      shortDesc: 'Wide-cut Japanese kimono abaya bordered with duchess satin trims.',
      price: 460,
      comparePrice: 580,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Raya Midnight Pearl Scalloped Abaya',
      slug: 'raya-midnight-pearl-scalloped-abaya',
      desc: 'Hand-set freshwater faux pearls embedded in scalloped laser-cut cuffs. Cut in a subtle A-line flare that flatters all body silhouettes with supreme poise.',
      shortDesc: 'Laser-cut scalloped sleeve cuffs set with micro freshwater faux pearls.',
      price: 610,
      comparePrice: 750,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fNida,
    },
    {
      name: 'Farah French Lace Wedding Abaya',
      slug: 'farah-french-lace-wedding-abaya',
      desc: 'A dreamlike bridal composition woven from luminous ivory silk organza overlaid with Chantilly lace. Features hand-placed crystal droplets and pearl borders.',
      shortDesc: 'Bridal ivory silk organza with delicate Chantilly French lace motifs.',
      price: 1350,
      comparePrice: 1700,
      catSlug: 'bridal-abayas',
      images: [
        'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1550614000-4895a10e1bfd?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fSilk,
    },
    {
      name: 'Maryam Textured Linen Travel Abaya',
      slug: 'maryam-textured-linen-travel-abaya',
      desc: 'Engineered specifically for travel and daily movement. Wrinkle-resistant blended linen fabric with hidden zippered security pockets and snap-cuff sleeves for easy ablution.',
      shortDesc: 'Wrinkle-resistant travel abaya with hidden zip compartments and wudhu snaps.',
      price: 420,
      comparePrice: 520,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fLinen,
    },
    {
      name: 'Hessa Emerald Green Jacquard Abaya',
      slug: 'hessa-emerald-green-jacquard-abaya',
      desc: 'Subtle tone-on-tone damask jacquard weave with a silky hand feel. Deep rich forest emerald tone with folded shawl collar and self-tie matching belt.',
      shortDesc: 'Damask jacquard weave in jewel emerald with tailored shawl lapel.',
      price: 580,
      comparePrice: 720,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cEmerald,
      fabric: fCrepe,
    },
    {
      name: 'Khadija Royal Batwing Cut Abaya',
      slug: 'khadija-royal-batwing-cut-abaya',
      desc: 'Extremely roomy and modest oversized batwing silhouette. Falls in graceful drapes from high neck down to ankle, offering maximum modest coverage and comfort.',
      shortDesc: 'Generous batwing flowing silhouette in heavy premium crepe.',
      price: 490,
      comparePrice: 600,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Maha Metallic Thread Embroidered Abaya',
      slug: 'maha-metallic-thread-embroidered-abaya',
      desc: 'Intricate silver and pewter metallic thread geometric motifs embroidered down the center front. Clean concealed button placket with a structured crisp drape.',
      shortDesc: 'Pewter and silver metallic geometric center-front embroidery.',
      price: 690,
      comparePrice: 850,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fCrepe,
    },
    {
      name: 'Lulwa Velvet Touch Winter Trench Abaya',
      slug: 'lulwa-velvet-touch-winter-trench-abaya',
      desc: 'A structured winter abaya inspired by the classic British double-breasted trench coat. Complete with notched collar, shoulder storm flaps, and horn buttons.',
      shortDesc: 'Double-breasted trench silhouette in insulated plush velvet.',
      price: 880,
      comparePrice: 1050,
      catSlug: 'silk-velvet',
      images: [
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fVelvet,
    },
    {
      name: 'Reem Satin-Faced Organza Eid Abaya',
      slug: 'reem-satin-faced-organza-eid-abaya',
      desc: 'Dual-layered with high-grade crisp organza over liquid satin. Captures lighting with a breathtaking ethereal shimmer designed for joyous festive gatherings.',
      shortDesc: 'Dual-layered shimmering organza with lustrous liquid satin lining.',
      price: 760,
      comparePrice: 950,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cDustyRose,
      fabric: fSilk,
    },
    {
      name: 'Salma Crystal Beaded Cuffs Open Abaya',
      slug: 'salma-crystal-beaded-cuffs-open-abaya',
      desc: 'Understated front with brilliant Czech crystal clusters clustered at the cuffs. Flashes sparkles subtly with wrist gestures during evening celebrations.',
      shortDesc: 'Czech crystal-embellished cuffs on deep navy midnight crepe.',
      price: 590,
      comparePrice: 720,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cNavy,
      fabric: fCrepe,
    },
    {
      name: 'Danah Gold Embroidered Bisht Abaya',
      slug: 'danah-gold-embroidered-bisht-abaya',
      desc: 'Traditional Gulf Bisht-inspired cut with sweeping width and high-sheen metallic golden zari edging. Drapes over shoulders like royal regalia.',
      shortDesc: 'Traditional sweeping Bisht silhouette with authentic Gulf zari border.',
      price: 920,
      comparePrice: 1150,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Aisha Soft Washed Linen Utility Abaya',
      slug: 'aisha-soft-washed-linen-utility-abaya',
      desc: 'Practical yet chic everyday abaya featuring safari-inspired flap chest pockets and tortoiseshell horn buttons. Breathable and comfortable for all-day wear.',
      shortDesc: 'Safari flap pocket details with sustainable horn buttons in pure linen.',
      price: 430,
      comparePrice: 530,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cDustyRose,
      fabric: fLinen,
    },
    {
      name: 'Shahad Shimmering Jacquard Formal Abaya',
      slug: 'shahad-shimmering-jacquard-formal-abaya',
      desc: 'Jacquard woven with ultra-fine lurex yarns that produce an all-over diamond motif. High-end couture finish with bias-cut lining that prevents cling.',
      shortDesc: 'Subtle lurex diamond jacquard with anti-static silk lining.',
      price: 710,
      comparePrice: 890,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fSilk,
    },
    {
      name: 'Fatima Velvet Applique Kimono Abaya',
      slug: 'fatima-velvet-applique-kimono-abaya',
      desc: 'Sculpted botanical velvet patches meticulously appliqued by hand along the wide bell cuffs and lapel. Comes with an adjustable braided waist cord.',
      shortDesc: 'Hand-cut botanical velvet applique on flared sleeves with braided belt.',
      price: 670,
      comparePrice: 830,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fCrepe,
    },
  ];

  let insertedCount = 0;

  for (const item of catalog) {
    // Check if product already exists
    let prod = await prisma.products.findUnique({ where: { slug: item.slug } });
    if (prod) {
      console.log(`Product "${item.name}" already exists. Skipping.`);
      continue;
    }

    const skuPrefix = 'SBA-' + item.slug.substring(0, 4).toUpperCase();

    prod = await prisma.products.create({
      data: {
        name: item.name,
        slug: item.slug,
        description: item.desc,
        short_description: item.shortDesc,
        sku_prefix: skuPrefix,
        status: product_status.PUBLISHED,
        is_featured: item.isFeatured,
        is_cod_allowed: true,
        published_at: new Date(),
      },
    });

    // Link category
    const catId = categoryMap.get(item.catSlug) || mainAbaya.id;
    await prisma.product_categories.createMany({
      data: [
        { product_id: prod.id, category_id: mainAbaya.id },
        ...(catId !== mainAbaya.id ? [{ product_id: prod.id, category_id: catId }] : []),
      ],
      skipDuplicates: true,
    });

    // Product Images
    await prisma.product_images.createMany({
      data: item.images.map((imgUrl, idx) => ({
        product_id: prod.id,
        image_url: imgUrl,
        is_thumbnail: idx === 0,
        sort_order: idx + 1,
      })),
    });

    // Variants for sizes: 52, 54, 56, 58
    const sizeMap = [
      { sizeStr: '52', sizeVal: s52, stock: 15 },
      { sizeStr: '54', sizeVal: s54, stock: 20 },
      { sizeStr: '56', sizeVal: s56, stock: 18 },
      { sizeStr: '58', sizeVal: s58, stock: 12 },
    ];

    for (const s of sizeMap) {
      const variantSku = `${skuPrefix}-${s.sizeStr}`;
      const variant = await prisma.product_variants.create({
        data: {
          product_id: prod.id,
          sku: variantSku,
          price: item.price,
          compare_price: item.comparePrice,
          status: variant_status.ACTIVE,
        },
      });

      // Attribute values
      await prisma.variant_attribute_values.createMany({
        data: [
          { variant_id: variant.id, attribute_value_id: item.color },
          { variant_id: variant.id, attribute_value_id: s.sizeVal },
          { variant_id: variant.id, attribute_value_id: item.fabric },
        ],
      });

      // Inventory
      await prisma.inventory.create({
        data: {
          variant_id: variant.id,
          warehouse_id: warehouse.id,
          quantity: s.stock,
          available_quantity: s.stock,
          reserved_quantity: 0,
        },
      });

      // Link to Flash Sale offer if featured
      if (item.isFeatured && flashOffer) {
        await prisma.offer_products.create({
          data: {
            offer_id: flashOffer.id,
            variant_id: variant.id,
          },
        }).catch(() => {});
      }
    }

    insertedCount++;
    console.log(`[${insertedCount}/20] Created "${item.name}"`);
  }

  console.log(`Successfully completed product seeding! Added ${insertedCount} new products.`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

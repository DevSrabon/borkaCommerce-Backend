const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Unsplash Dummy Data Seeding for Saba Al Wadi ---');

  // 1. Ensure Warehouse exists
  let warehouse = await prisma.warehouses.findFirst();
  if (!warehouse) {
    warehouse = await prisma.warehouses.create({
      data: {
        name: 'Dubai Luxury Flagship Warehouse',
        location: 'Downtown Dubai, UAE',
      },
    });
    console.log('✓ Warehouse created:', warehouse.name);
  }

  // 2. Seed / Ensure Categories
  console.log('Seeding categories with Unsplash images...');
  let mainAbaya = await prisma.categories.findFirst({ where: { slug: 'abaya' } });
  if (!mainAbaya) {
    mainAbaya = await prisma.categories.create({
      data: {
        name: 'Abayas',
        slug: 'abaya',
        description: 'Exquisite haute couture & daily modest abayas',
        image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        is_active: true,
        show_in_navbar: true,
        show_on_homepage: true,
        sort_order: 1,
      },
    });
  }

  const subCategoriesData = [
    {
      name: 'Luxury Abayas',
      slug: 'luxury-abayas',
      desc: 'Handcrafted luxury abayas with Swarovski and pearl embellishments',
      image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 1,
    },
    {
      name: 'Casual Daily Abayas',
      slug: 'casual-abayas',
      desc: 'Lightweight, breathable linen and crepe for daily elegance',
      image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 2,
    },
    {
      name: 'Open Abayas & Kimonos',
      slug: 'open-abayas',
      desc: 'Modern open-front flowing silhouettes and layered abayas',
      image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 3,
    },
    {
      name: 'Eid & Festive Couture',
      slug: 'eid-collection',
      desc: 'Regal festive ensembles for special celebrations',
      image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 4,
    },
    {
      name: 'Silk & Velvet Abayas',
      slug: 'silk-velvet',
      desc: 'Rich Japanese raw silk and royal plush velvet abayas',
      image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 5,
    },
    {
      name: 'Shaylas & Hijabs',
      slug: 'shaylas-hijabs',
      desc: 'Matching luxury chiffon, georgette, and modal scarves',
      image: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80',
      showNav: true,
      showHome: true,
      sort: 6,
    },
  ];

  const categoryMap = new Map();
  categoryMap.set('abaya', mainAbaya.id);

  for (const c of subCategoriesData) {
    let cat = await prisma.categories.findFirst({ where: { slug: c.slug } });
    if (!cat) {
      cat = await prisma.categories.create({
        data: {
          name: c.name,
          slug: c.slug,
          description: c.desc,
          image: c.image,
          parent_id: mainAbaya.id,
          is_active: true,
          show_in_navbar: c.showNav,
          show_on_homepage: c.showHome,
          sort_order: c.sort,
        },
      });
    } else {
      cat = await prisma.categories.update({
        where: { id: cat.id },
        data: {
          image: c.image,
          show_in_navbar: c.showNav,
          show_on_homepage: c.showHome,
        },
      });
    }
    categoryMap.set(c.slug, cat.id);
  }
  console.log('✓ Categories seeded.');

  // 3. Seed Attributes & Values
  const ensureAttr = async (name) => {
    let row = await prisma.attributes.findFirst({ where: { name } });
    if (!row) {
      row = await prisma.attributes.create({ data: { name } });
    }
    return row;
  };

  const ensureAttrVal = async (attribute_id, value) => {
    let row = await prisma.attribute_values.findFirst({
      where: { attribute_id, value },
    });
    if (!row) {
      row = await prisma.attribute_values.create({
        data: { attribute_id, value },
      });
    }
    return row.id;
  };

  const colorAttr = await ensureAttr('Color');
  const sizeAttr = await ensureAttr('Size');
  const fabricAttr = await ensureAttr('Fabric');

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

  // 4. Seed Homepage Banners with Unsplash Images
  console.log('Seeding homepage banners...');
  const bannerCount = await prisma.banners.count();
  if (bannerCount === 0) {
    await prisma.banners.createMany({
      data: [
        {
          title: 'Eid Collection 2026',
          subtitle: 'Handcrafted luxury abayas with pure silk embroidery & timeless modesty.',
          cta_text: 'Explore Collection',
          cta_link: '/catalog?category=eid-collection',
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
          cta_link: '/catalog?category=casual-abayas',
          image_url: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=1920',
          alt_text: 'Casual Nidha Abayas Hero Banner',
          size_type: 'HERO',
          size_description: 'Desktop Hero: 1920x800px (Full Width)',
          sort_order: 2,
          is_active: true,
        },
        {
          title: 'Flash Sale: 20% OFF Selected Abayas',
          subtitle: 'Use code WELCOME10 for an additional 10% discount on order above 100 AED.',
          cta_text: 'Claim Offer',
          cta_link: '/offers',
          image_url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800',
          alt_text: 'Flash Sale Promo Card',
          size_type: 'SMALL',
          size_description: 'Promo Card: 600x400px (Small Banner)',
          sort_order: 1,
          is_active: true,
        },
        {
          title: 'Matching Shayla & Scarves',
          subtitle: 'Complete your modest ensemble with hand-stitched matching accessories.',
          cta_text: 'View Scarves',
          cta_link: '/catalog?category=shaylas-hijabs',
          image_url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800',
          alt_text: 'Shayla & Scarves Mini Banner',
          size_type: 'SMALL',
          size_description: 'Promo Card: 600x400px (Small Banner)',
          sort_order: 2,
          is_active: true,
        },
      ],
    });
    console.log('✓ Banners seeded.');
  }

  // 5. Seed Blogs with Unsplash Images
  console.log('Seeding blog articles with Unsplash images...');
  const blogCount = await prisma.blogs.count();
  if (blogCount === 0) {
    await prisma.blogs.createMany({
      data: [
        {
          title: 'The Essential Guide to Caring for Korean Nida Abayas',
          slug: 'guide-caring-for-korean-nida-abayas',
          excerpt: 'Discover expert tips on washing, steaming, and preserving the luxurious drape and deep black hue of your premium Nida abayas.',
          content: '<p>Korean Nida is revered throughout the Arabian Gulf for its feather-light feel, fluid drape, and breathable weave. To keep your Nida abaya looking bespoke season after season, follow these essential maintenance steps:</p><h3>1. Gentle Cold Wash</h3><p>Always hand-wash or select the delicate cold-water cycle. Avoid harsh bleaches or heavy detergents that weaken synthetic silk microfibers.</p><h3>2. Steam, Never Direct Iron</h3><p>Direct hot iron contact can cause unsightly shiny patches on deep black fabric. Utilize a garment steamer held at a 4-inch distance for an immaculate, wrinkle-free finish.</p>',
          featured_image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80',
          main_image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=80',
          category: 'Care & Styling',
          author: 'Saba Al Wadi',
          views: 142,
          is_published: true,
        },
        {
          title: 'Modest Fashion Trends 2026: The Rise of Layered Open Silhouettes',
          slug: 'modest-fashion-trends-2026-open-silhouettes',
          excerpt: 'Explore how open kimonos and coordinated linen under-dresses are defining contemporary modest elegance across Dubai and Riyadh.',
          content: '<p>Modern modest fashion in 2026 bridges the heritage of traditional Emirati cuts with cosmopolitan fluidity. Open-front kimonos paired with monochrome slip dresses create an effortlessly regal silhouette suitable for both boardroom meetings and evening gatherings.</p><h3>The Power of Neutral Tones</h3><p>Earthy sage, desert sands, and muted champagne tones have taken center stage, offering a versatile capsule wardrobe for every modest connoisseur.</p>',
          featured_image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
          main_image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
          category: 'Trends',
          author: 'Saba Al Wadi',
          views: 289,
          is_published: true,
        },
        {
          title: 'Velvet Couture: Why Royal Velvet is the Ultimate Winter Abaya Choice',
          slug: 'velvet-couture-ultimate-winter-abaya',
          excerpt: 'Unveil the rich history and opulent warmth of heavyweight velvet abayas embellished with intricate gold cord work.',
          content: '<p>When temperatures drop in the evening desert air, royal plush velvet stands unrivaled. Its plush texture absorbs light to produce deeply saturated hues of emerald, midnight navy, and burgundy.</p>',
          featured_image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=1200&q=80',
          main_image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=1200&q=80',
          category: 'Couture',
          author: 'Saba Al Wadi',
          views: 95,
          is_published: true,
        },
      ],
    });
    console.log('✓ Blogs seeded.');
  }

  // 6. Seed 20 Luxury Products with Unsplash Images
  console.log('Seeding 20 Luxury Products...');
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
      name: 'Maryam Pleated Georgette Kimono Abaya',
      slug: 'maryam-pleated-georgette-kimono-abaya',
      desc: 'Architectural accord-pleating along the back and sleeves in featherweight Japanese georgette crepe. Designed as an open front kimono that layers over neutral slips.',
      shortDesc: 'Japanese georgette crepe with micro-accordion pleats on cascading kimono sleeves.',
      price: 520,
      comparePrice: 650,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fCrepe,
    },
    {
      name: 'Qamar Crystal Trimmed Black Open Abaya',
      slug: 'qamar-crystal-trimmed-black-open-abaya',
      desc: 'Dazzling baguette-cut Austrian crystals border the lapel from neckline to hem. Made from anti-static, wrinkle-resistant premium Korean Nida.',
      shortDesc: 'Austrian crystal baguette borders framing an open-front Korean Nida silhouette.',
      price: 740,
      comparePrice: 920,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Reem Laser-Cut Floral Organza Abaya',
      slug: 'reem-laser-cut-floral-organza-abaya',
      desc: 'Two-tier overlay abaya featuring laser-cut botanical arabesque motifs over a contrasting matte Nida base layer. Ethereal and weightless.',
      shortDesc: 'Laser-cut floral organza overlay cascading over a midnight black foundation.',
      price: 820,
      comparePrice: 1050,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fSilk,
    },
    {
      name: 'Salma Everyday Pocketed Linen Abaya',
      slug: 'salma-everyday-pocketed-linen-abaya',
      desc: 'The consummate balance of modesty and practicality. Roomy A-line cut with reinforced inseam pockets, raglan sleeves, and hidden front zip.',
      shortDesc: 'Functional A-line silhouette with concealed zipper and deep functional pockets.',
      price: 340,
      comparePrice: 420,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cNavy,
      fabric: fLinen,
    },
    {
      name: 'Amira Pearls & Gold Thread Eid Abaya',
      slug: 'amira-pearls-gold-thread-eid-abaya',
      desc: 'Designed exclusively for festive occasions. Fuses genuine freshwater seed pearls with spun gold threads across an asymmetrical drape.',
      shortDesc: 'Hand-sewn freshwater seed pearls and gold bullion embroidery on double georgette.',
      price: 880,
      comparePrice: 1150,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cEmerald,
      fabric: fCrepe,
    },
    {
      name: 'Srabon Flared French Lace Abaya',
      slug: 'srabon-flared-french-lace-abaya',
      desc: 'Romantic scalloped Chantilly lace adorns the bell cuffs and sweeping hemline. Crafted from ultra-smooth, lightweight crepe for effortless evening flow.',
      shortDesc: 'Intricate French Chantilly scalloped lace trimming sweeping flared bell sleeves.',
      price: 640,
      comparePrice: 800,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Hessa Reversible Silk Crepe Abaya',
      slug: 'hessa-reversible-silk-crepe-abaya',
      desc: 'Two distinct looks in one bespoke garment. Reversible design featuring Midnight Black on one side and rich Royal Navy on the interior.',
      shortDesc: 'Innovative dual-tone reversible abaya in double-faced Italian silk crepe.',
      price: 780,
      comparePrice: 980,
      catSlug: 'silk-velvet',
      images: [
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fSilk,
    },
    {
      name: 'Lubna Textured Waffle Knit Daily Abaya',
      slug: 'lubna-textured-waffle-knit-daily-abaya',
      desc: 'Cozy, modern texture meets modest sensibilities. Wrinkle-free waffle knit cotton-blend that requires minimal care for university, work, and errands.',
      shortDesc: 'Textured cotton-blend waffle weave offering cozy warmth and non-iron ease.',
      price: 310,
      comparePrice: 390,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cDustyRose,
      fabric: fCrepe,
    },
    {
      name: 'Nouf Jacquard Brocade Festive Abaya',
      slug: 'nouf-jacquard-brocade-festive-abaya',
      desc: 'Woven with raised gold jacquard arabesque motifs inspired by heritage Andalusian architecture. Features a structured shawl lapel.',
      shortDesc: 'Andalusian-inspired gold metallic jacquard brocade with a tailored shawl lapel.',
      price: 920,
      comparePrice: 1180,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fSilk,
    },
    {
      name: 'Rawan Ombre Silk Chiffon Kimono',
      slug: 'rawan-ombre-silk-chiffon-kimono',
      desc: 'Artisanal dip-dyed ombre transition from soft dusty rose to deep burgundy. Floats effortlessly in the breeze.',
      shortDesc: 'Hand dip-dyed gradient silk chiffon flowing seamlessly from blush to burgundy.',
      price: 590,
      comparePrice: 720,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cDustyRose,
      fabric: fCrepe,
    },
    {
      name: 'Shamsa Metallic Thread Embroidered Abaya',
      slug: 'shamsa-metallic-thread-embroidered-abaya',
      desc: 'Subtle gunmetal and pewter cord work embroidered in geometric celestial patterns along sleeve cuff bands and back yoke.',
      shortDesc: 'Pewter metallic geometric thread embroidery on premium Korean matte Nida.',
      price: 690,
      comparePrice: 860,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Dana Classic Umbrella Flare Nida Abaya',
      slug: 'dana-classic-umbrella-flare-nida-abaya',
      desc: 'Dramatic 120-inch umbrella flare hem that glides with majestic poise. Made with non-cling, heavy drape premium Nida with elasticated wudu-friendly cuffs.',
      shortDesc: 'Magnificent 120-inch circular flare with elasticated wudu-friendly inner sleeves.',
      price: 430,
      comparePrice: 540,
      catSlug: 'casual-abayas',
      images: [
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cBlack,
      fabric: fNida,
    },
    {
      name: 'Khawla Tassel Trimmed Linen Kimono',
      slug: 'khawla-tassel-trimmed-linen-kimono',
      desc: 'Bohemian luxury modest coat with artisanal silk thread tassels and wood-carved beads framing the lapel.',
      shortDesc: 'Handmade silk fringe tassels and organic Italian linen open silhouette.',
      price: 490,
      comparePrice: 620,
      catSlug: 'open-abayas',
      images: [
        'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: false,
      color: cDustyRose,
      fabric: fLinen,
    },
    {
      name: 'Hind Pearl Embroidered Cape Abaya',
      slug: 'hind-pearl-embroidered-cape-abaya',
      desc: 'Removable shoulder capelet hand-studded with hundreds of varied-sized faux pearls. Wear with or without the cape for dual styling versatility.',
      shortDesc: 'Detachable royal capelet adorned with graduated faux pearls over flowing crepe.',
      price: 860,
      comparePrice: 1090,
      catSlug: 'eid-collection',
      images: [
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cChampagne,
      fabric: fCrepe,
    },
    {
      name: 'Jawaher Midnight Navy Velvet Evening Abaya',
      slug: 'jawaher-midnight-navy-velvet-evening-abaya',
      desc: 'Deep cosmic navy velvet that shimmers under event lighting. Finished with French satin piping and magnetic snap buttons.',
      shortDesc: 'Midnight navy plush velvet with French satin edge piping and concealed magnets.',
      price: 840,
      comparePrice: 1020,
      catSlug: 'silk-velvet',
      images: [
        'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cNavy,
      fabric: fVelvet,
    },
    {
      name: 'Al-Maha Hand-Painted Silk Organza Abaya',
      slug: 'al-maha-hand-painted-silk-organza-abaya',
      desc: 'Each piece is individually painted by local artisan calligraphers with gold calligraphy poetry verses. A collector’s couture investment.',
      shortDesc: 'Artisanal hand-painted gold Arabic calligraphy on translucent silk organza.',
      price: 1100,
      comparePrice: 1450,
      catSlug: 'luxury-abayas',
      images: [
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
      ],
      isFeatured: true,
      color: cBlack,
      fabric: fSilk,
    },
  ];

  let insertedCount = 0;

  for (const item of catalog) {
    let existingProd = await prisma.products.findUnique({
      where: { slug: item.slug },
    });

    if (existingProd) {
      console.log(`Product "${item.name}" already exists, skipping.`);
      continue;
    }

    const catId = categoryMap.get(item.catSlug) || mainAbaya.id;
    const skuPrefix = item.slug.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');

    const prod = await prisma.products.create({
      data: {
        name: item.name,
        slug: item.slug,
        description: item.desc,
        short_description: item.shortDesc,
        status: 'PUBLISHED',
        is_featured: item.isFeatured,
        is_cod_allowed: true,
        product_number: `PRD-${Math.floor(100000 + Math.random() * 900000)}`,
        product_categories: {
          create: [{ category_id: catId }],
        },
      },
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
          status: 'ACTIVE',
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
    }

    insertedCount++;
    console.log(`[${insertedCount}/20] Created "${item.name}"`);
  }

  console.log(`\n🎉 Finished seeding Unsplash dummy data! Total products added: ${insertedCount}`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

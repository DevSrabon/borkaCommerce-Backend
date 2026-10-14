const { PrismaClient, product_status, variant_status } = require('@prisma/client');
const prisma = new PrismaClient();

// High quality curated modest fashion image pool
const imagePool = [
  'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1579613832125-5d34a13ffe0a?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1549575810-b9b7a58a74e9?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=800',
];

const productCatalogDefinitions = [
  // Luxury Couture Collection
  { name: 'Royal Emirati Velvet Kaftan Abaya', cat: 'abaya-luxury', fabric: 'Royal Plush Velvet', price: 620, compare: 750, desc: 'Cut from deep midnight plush velvet adorned with delicate gold zaree work along the sleeves and neckline.' },
  { name: 'Zahra Silk Georgette Embellished Abaya', cat: 'abaya-luxury', fabric: 'Pure Mulberry Silk', price: 580, compare: 690, desc: 'Features flowing georgette layers over pure Mulberry silk lining with artisanal micro-crystal detailing.' },
  { name: 'Noor Hand-Beaded Crystal Couture Abaya', cat: 'abaya-luxury', fabric: 'Korean Nida', price: 750, compare: 890, desc: 'Intricately handcrafted with genuine glass crystals on the cuffs and bodice. Perfect for luxury evening galas.' },
  { name: 'Malika Embroidered Velvet Overlay Abaya', cat: 'abaya-luxury', fabric: 'Royal Plush Velvet', price: 640, compare: 780, desc: 'Opulent dual-layer velvet overlay featuring Arabian vine embroidery and scalloped hemlines.' },
  { name: 'Layla French Lace Trimmed Luxury Abaya', cat: 'abaya-luxury', fabric: 'Nidha', price: 520, compare: 620, desc: 'Lustrous Japanese Nidha enhanced with scalloped Chantilly lace cuffs and front closure.' },
  { name: 'Sultana Gold Zari Hand-Woven Abaya', cat: 'abaya-luxury', fabric: 'Pure Mulberry Silk', price: 820, compare: 990, desc: 'A majestic couture piece accented with genuine metallic thread embroidery crafted by master artisans in Dubai.' },
  { name: 'Farah Organza Layered Couture Abaya', cat: 'abaya-luxury', fabric: 'Silk', price: 590, compare: 720, desc: 'Ethereal sheer organza drapery cascading over a structured opaque silk slip with magnetic closures.' },
  { name: 'Shahrazad Pearl Beaded Silhouette Abaya', cat: 'abaya-luxury', fabric: 'Korean Nida', price: 690, compare: 820, desc: 'Hand-sewn freshwater cultured pearls decorating the sleeves and hemline for subtle dignified splendor.' },
  { name: 'Amira Platinum Thread Embellished Abaya', cat: 'abaya-luxury', fabric: 'Nidha', price: 610, compare: 730, desc: 'Shimmering metallic platinum geometric embroidery on supreme quality matte Nidha textile.' },
  { name: 'Soraya Jacquard Silk Evening Abaya', cat: 'abaya-luxury', fabric: 'Pure Mulberry Silk', price: 570, compare: 680, desc: 'Tonal floral jacquard weave catching the light with understated grandeur and effortless elegance.' },
  { name: 'Loulwa Swarovski Cuff Designer Abaya', cat: 'abaya-luxury', fabric: 'Japanese Georgette Crepe', price: 780, compare: 920, desc: 'Statement cuffs encrusted with genuine faceted crystals designed for prestigious Eid and wedding gatherings.' },
  { name: 'Aaliyah Regal Silk Velvet Open Abaya', cat: 'abaya-luxury', fabric: 'Royal Plush Velvet', price: 660, compare: 800, desc: 'Plush velvet kimono abaya featuring wide kimono sleeves and satin piping along the lapel.' },

  // Eid & Festive Collection
  { name: 'Al-Reem Festive Gold Embroidered Abaya', cat: 'abaya-eid-collection', fabric: 'Korean Nida', price: 480, compare: 580, desc: 'Celebratory ensemble boasting golden floral embroidery along the bell sleeves and front placket.' },
  { name: 'Qamar Eid Moonlit Chiffon Ensemble', cat: 'abaya-eid-collection', fabric: 'Chiffon', price: 420, compare: 510, desc: 'Double-layered chiffon designed to capture festive movement with matching sheer chiffon shayla.' },
  { name: 'Jawhara Diamond Pleated Festive Abaya', cat: 'abaya-eid-collection', fabric: 'Japanese Georgette Crepe', price: 540, compare: 650, desc: 'Accordion sunburst pleats radiating from the waistline for a striking architectural silhouette.' },
  { name: 'Nasma Festive Shimmer Linen Abaya', cat: 'abaya-eid-collection', fabric: 'Organic Italian Linen', price: 460, compare: 550, desc: 'Fine metallic-woven Italian linen providing cool comfort during warm festive celebrations.' },
  { name: 'Danah Sequin Trimmed Celebration Abaya', cat: 'abaya-eid-collection', fabric: 'Nidha', price: 510, compare: 620, desc: 'Subtle micro-sequins embedded into the sleeve cuffs reflecting festive chandeliers.' },
  { name: 'Budoor Starburst Embellished Eid Abaya', cat: 'abaya-eid-collection', fabric: 'Korean Nida', price: 490, compare: 590, desc: 'Handcrafted metallic stars clustered around the shoulders and collarbone.' },
  { name: 'Ritaj Royal Brocade Trim Eid Abaya', cat: 'abaya-eid-collection', fabric: 'Silk', price: 530, compare: 640, desc: 'Rich Turkish brocade borders adding timeless nobility to a modern tailored cut.' },
  { name: 'Rawan Tiered Ruffle Festive Abaya', cat: 'abaya-eid-collection', fabric: 'Chiffon', price: 440, compare: 530, desc: 'Cascading tiers of soft breathable chiffon creating a voluminous festive presence.' },
  { name: 'Sahar Lurex Thread Festive Kimono Abaya', cat: 'abaya-eid-collection', fabric: 'Linen', price: 470, compare: 570, desc: 'Lustrous lurex threads woven seamlessly through breathable natural fibers.' },
  { name: 'Tasneem Champagne Gold Eid Silhouette', cat: 'abaya-eid-collection', fabric: 'Pure Mulberry Silk', price: 560, compare: 670, desc: 'Warm champagne undertones with hand-embroidered floral arabesques.' },

  // Casual & Daily Wear
  { name: 'Essential Minimalist Matte Black Abaya', cat: 'abaya-casual', fabric: 'Nidha', price: 220, compare: 270, desc: 'The quintessential daily abaya. Breathable, non-transparent, crease-resistant, and machine-washable.' },
  { name: 'Al-Nakheel Breathable Linen Daily Abaya', cat: 'abaya-casual', fabric: 'Organic Italian Linen', price: 260, compare: 310, desc: 'Crafted from pure natural linen with roll-up button sleeves for everyday errands and work.' },
  { name: 'Deira Daily Utility Pocket Abaya', cat: 'abaya-casual', fabric: 'Korean Nida', price: 240, compare: 290, desc: 'Functional contemporary abaya with deep concealed side pockets and elastic cuffs for wudhu convenience.' },
  { name: 'Jumeirah Breeze Loose-Fit Daily Abaya', cat: 'abaya-casual', fabric: 'Nidha', price: 230, compare: 280, desc: 'Ultra-lightweight everyday silhouette cut for exceptional air circulation and modest coverage.' },
  { name: 'Marina Front-Zip Everyday Abaya', cat: 'abaya-casual', fabric: 'Korean Nida', price: 250, compare: 300, desc: 'High-grade hidden YKK front zipper for nursing mothers and quick on-the-go styling.' },
  { name: 'Barsha Minimalist Flared Hem Abaya', cat: 'abaya-casual', fabric: 'Japanese Georgette Crepe', price: 270, compare: 330, desc: 'Flattering A-line flair offering effortless stride and complete opacity for workplace modesty.' },
  { name: 'Zabeel Cotton Blend Daily Caftan', cat: 'abaya-casual', fabric: 'Linen', price: 210, compare: 260, desc: 'Soft textured cotton-linen blend perfect for humid climates and warm afternoon wear.' },
  { name: 'Khorfakkan Relaxed Daily Cocoon Abaya', cat: 'abaya-casual', fabric: 'Nidha', price: 245, compare: 295, desc: 'Modern batwing cocoon drape that provides full modest concealment with featherweight drape.' },
  { name: 'Ajman Classic Button-Down Everyday Abaya', cat: 'abaya-casual', fabric: 'Korean Nida', price: 235, compare: 285, desc: 'Featuring discrete snap buttons along the front to style as open kimono or closed abaya.' },
  { name: 'Fujairah Striped Cuff Casual Abaya', cat: 'abaya-casual', fabric: 'Nidha', price: 225, compare: 275, desc: 'Subtle tone-on-tone pinstriped cuff detailing for understated corporate professionalism.' },

  // Open Abayas & Kimonos
  { name: 'Al-Wasl Linen Trench Coat Abaya', cat: 'open-abayas', fabric: 'Organic Italian Linen', price: 340, compare: 410, desc: 'Contemporary trench-inspired silhouette with storm flap, matching belt, and notched lapels.' },
  { name: 'Downtown Dubai Georgette Duster Kimono', cat: 'open-abayas', fabric: 'Japanese Georgette Crepe', price: 310, compare: 380, desc: 'Lightweight flowing open front kimono designed to effortlessly layer over co-ord sets.' },
  { name: 'Creek Harbour Bohemian Fringe Kimono', cat: 'open-abayas', fabric: 'Linen', price: 290, compare: 350, desc: 'Boho-luxe open duster with delicate tassel fringe borders and relaxed batwing sleeves.' },
  { name: 'Meydan Silk Satin Reversible Kimono', cat: 'open-abayas', fabric: 'Pure Mulberry Silk', price: 450, compare: 540, desc: 'Versatile reversible design offering deep onyx black on one side and lustrous champagne on reverse.' },
  { name: 'Palm Breeze Sheer Chiffon Cape Abaya', cat: 'open-abayas', fabric: 'Chiffon', price: 280, compare: 340, desc: 'Floating cape silhouette that drapes gracefully over formal evening eveningwear.' },
  { name: 'Hatta Mountain Raw Linen Kimono', cat: 'open-abayas', fabric: 'Organic Italian Linen', price: 320, compare: 390, desc: 'Earthy unbleached organic linen with deep patch pockets and relaxed kimono lapels.' },
  { name: 'Sharjah Heritage Cutwork Open Abaya', cat: 'open-abayas', fabric: 'Nidha', price: 360, compare: 430, desc: 'Geometric laser-cut lace inserts decorating the hemlines with matching inner slip.' },
  { name: 'City Walk Modern Belted Robe Abaya', cat: 'open-abayas', fabric: 'Korean Nida', price: 330, compare: 400, desc: 'Tailored robe styling with wide fabric sash and clean modern tailoring.' },

  // Bridal Modest Collection
  { name: 'Al-Aroos Pure Pearl Bridal Abaya', cat: 'bridal-abayas', fabric: 'Pure Mulberry Silk', price: 1100, compare: 1350, desc: 'Masterpiece bridal gown abaya featuring thousands of hand-placed pearls and silver zaree lace.' },
  { name: 'Laylat Al-Omar Ivory Chantilly Lace Abaya', cat: 'bridal-abayas', fabric: 'Silk', price: 950, compare: 1180, desc: 'Bespoke bridal overlay cut from authentic French Chantilly floral lace over satin.' },
  { name: 'Zaffah Crystal Train Couture Bridal Abaya', cat: 'bridal-abayas', fabric: 'Pure Mulberry Silk', price: 1250, compare: 1500, desc: 'Dramatic 1.5-meter cathedral modest train encrusted with hand-beaded crystal constellation motifs.' },
  { name: 'Mahr White Silk Velvet Bridal Robe', cat: 'bridal-abayas', fabric: 'Royal Plush Velvet', price: 890, compare: 1080, desc: 'Snow white velvet couture robe created exclusively for intimate nikkah ceremonies.' },
  { name: 'Balsam Embroidered Nikkah Bridal Abaya', cat: 'bridal-abayas', fabric: 'Japanese Georgette Crepe', price: 920, compare: 1120, desc: 'Handmade silver embroidery mimicking floral vines on ivory georgette crepe.' },

  // Silk & Velvet Couture
  { name: 'Onyx Emerald Velvet Winter Abaya', cat: 'silk-velvet', fabric: 'Royal Plush Velvet', price: 540, compare: 650, desc: 'Lush jewel-toned emerald green velvet designed for Arabian winter evenings.' },
  { name: 'Royal Burgundy Crushed Velvet Abaya', cat: 'silk-velvet', fabric: 'Royal Plush Velvet', price: 520, compare: 630, desc: 'Rich wine crushed velvet capturing ambient light with every step.' },
  { name: 'Midnight Silk Twill Structured Abaya', cat: 'silk-velvet', fabric: 'Silk', price: 490, compare: 590, desc: 'Structured silk twill providing crisp lines, sharp lapels, and luxurious weight.' },
  { name: 'Imperial Sapphire Silk Velvet Caftan', cat: 'silk-velvet', fabric: 'Royal Plush Velvet', price: 560, compare: 680, desc: 'Deep royal blue velvet caftan with gold corded embroidery along the cuffs.' },
  { name: 'Golden Sand Silk Charmeuse Abaya', cat: 'silk-velvet', fabric: 'Pure Mulberry Silk', price: 510, compare: 620, desc: 'Drapes like molten liquid silk with ultra-smooth hand-feel and breathable comfort.' },

  // Shaylas & Hijabs
  { name: 'Premium Chiffon Instant Shayla Scarf', cat: 'shayla', fabric: 'Chiffon', price: 65, compare: 85, desc: 'Ultra-soft, lightweight chiffon scarf with non-slip texture and breathable weave.' },
  { name: 'Silk Georgette Luxury Long Hijab', cat: 'shayla', fabric: 'Silk', price: 85, compare: 110, desc: 'Fluid drape with subtle sheen. 200cm length for versatile modest wrapping styles.' },
  { name: 'Pleated Chiffon Everyday Shayla', cat: 'shayla', fabric: 'Chiffon', price: 70, compare: 90, desc: 'Micro-pleated texture that requires no ironing and holds position effortlessly all day.' },
  { name: 'Embroidered Edge Festive Shayla', cat: 'shayla', fabric: 'Silk', price: 95, compare: 125, desc: 'Embellished with scalloped embroidery and miniature glass beads along one edge.' },
  { name: 'Organic Cotton Modal Breathable Hijab', cat: 'shayla', fabric: 'Linen', price: 55, compare: 75, desc: 'Featherweight natural fibers designed for maximum airflow during high summer.' },
  { name: 'Crinkled Chiffon Max Hijab Wrap', cat: 'shayla', fabric: 'Chiffon', price: 60, compare: 80, desc: 'Non-slip crinkle texture providing effortless grip without the need for pins.' },

  // Niqabs
  { name: 'Single Layer Saudi Elastic Niqab', cat: 'niqab', fabric: 'Chiffon', price: 45, compare: 60, desc: 'Breathable ultra-soft chiffon with reinforced eye-band and comfortable wide elastic headband.' },
  { name: 'Double Layer Flap Saudi Style Niqab', cat: 'niqab', fabric: 'Chiffon', price: 55, compare: 70, desc: 'Two overlapping soft layers providing complete opacity while maintaining effortless breathability.' },
  { name: 'Half Niqab with Nose String Cord', cat: 'niqab', fabric: 'Nidha', price: 40, compare: 55, desc: 'Classic Gulf half-niqab with delicate adjustable cord for personalized eye comfort.' },
  { name: 'Three-Layer Long Tie-Back Khaleeji Niqab', cat: 'niqab', fabric: 'Chiffon', price: 65, compare: 85, desc: 'Extends below the shoulder blades for full coverage with lightweight flowing back cape.' },
  { name: 'Padded Eye-Band Anti-Pinch Niqab', cat: 'niqab', fabric: 'Korean Nida', price: 50, compare: 65, desc: 'Ergonomically designed soft padded eye opening that eliminates friction and redness.' },
];

// Expanded thematic generator to produce up to 130 realistic distinct products
const silhouetteStyles = [
  'Bisht Farasha', 'A-Line Flared', 'Butterfly Silhouette', 'Tailored Princess Cut',
  'Classic Emirati Straight', 'Cape Draped', 'Front-Wrap Robe', 'Waterfall Hem',
  'Dolman Sleeve', 'Bell Sleeve Flounce', 'Pleated Back Yoke', 'Lantern Sleeve',
  'Structured Blazer Collar', 'Kimono Caftan', 'Double-Breasted Trench'
];

const textileThemes = [
  { name: 'Nidha Matte', fabric: 'Nidha', priceBase: 280 },
  { name: 'Korean Nida Luxe', fabric: 'Korean Nida', priceBase: 340 },
  { name: 'Pure Mulberry Silk', fabric: 'Pure Mulberry Silk', priceBase: 580 },
  { name: 'Italian Organic Linen', fabric: 'Organic Italian Linen', priceBase: 320 },
  { name: 'Royal Plush Velvet', fabric: 'Royal Plush Velvet', priceBase: 510 },
  { name: 'Japanese Georgette Crepe', fabric: 'Japanese Georgette Crepe', priceBase: 360 },
  { name: 'Airy Chiffon', fabric: 'Chiffon', priceBase: 250 },
];

const colorOptions = [
  'Onyx Black', 'Midnight Navy', 'Emerald Green', 'Deep Plum Maroon', 'Dusty Rose',
  'Mocha Camel', 'Champagne Gold', 'Royal Sapphire', 'Slate Grey', 'Pearl Ivory'
];

async function seed150Products() {
  console.log('--- Starting Seeding ~130 products to reach ~150 products total ---');

  // Load reference categories
  const categories = await prisma.categories.findMany();
  const catMap = {};
  categories.forEach((c) => {
    catMap[c.slug] = c.id;
  });

  // Default category fallbacks
  const defaultAbayaCatId = catMap['abaya'] || categories[0].id;

  // Load warehouse
  const warehouse = await prisma.warehouses.findFirst();
  if (!warehouse) {
    throw new Error('No warehouse found in DB!');
  }

  // Load attributes & values
  const attrs = await prisma.attributes.findMany({ include: { values: true } });
  const colorAttr = attrs.find((a) => a.name.toLowerCase() === 'color');
  const sizeAttr = attrs.find((a) => a.name.toLowerCase() === 'size');
  const fabricAttr = attrs.find((a) => a.name.toLowerCase() === 'fabric');

  const colorValues = colorAttr ? colorAttr.values : [];
  const sizeValues = sizeAttr ? sizeAttr.values : [];
  const fabricValues = fabricAttr ? fabricAttr.values : [];

  // Load active offers
  const offers = await prisma.offers.findMany({ where: { status: 'ACTIVE' } });
  const flashOffer = offers.find((o) => o.type === 'FLASH_SALE') || offers[0];

  let currentCount = await prisma.products.count();
  console.log(`Current product count before seeding: ${currentCount}`);

  // Build target list of 130 products
  const productsToCreate = [...productCatalogDefinitions];

  let counter = 1;
  while (productsToCreate.length < 130) {
    const sil = silhouetteStyles[counter % silhouetteStyles.length];
    const textTheme = textileThemes[counter % textileThemes.length];
    const col = colorOptions[counter % colorOptions.length];
    const catSlug = counter % 5 === 0 ? 'abaya-luxury' : counter % 4 === 0 ? 'abaya-eid-collection' : counter % 3 === 0 ? 'open-abayas' : 'abaya-casual';

    const pName = `${col} ${textTheme.name} ${sil} Abaya`;
    const price = textTheme.priceBase + (counter % 7) * 20;
    const compare = Math.round(price * 1.25);

    productsToCreate.push({
      name: pName,
      cat: catSlug,
      fabric: textTheme.fabric,
      price: price,
      compare: compare,
      desc: `Expertly tailored in Dubai with premium ${textTheme.fabric}. Showcases the distinguished ${sil} silhouette with seamless tailoring, modest volume, and comfortable breathability for discerning women.`,
    });
    counter++;
  }

  console.log(`Prepared ${productsToCreate.length} products to insert.`);

  let insertedCount = 0;

  for (let i = 0; i < productsToCreate.length; i++) {
    const item = productsToCreate[i];
    const baseSlug = item.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const uniqueSlug = `${baseSlug}-${i + 1}`;

    const skuPrefix = `SW-${baseSlug.substring(0, 8).toUpperCase()}-${i + 1}`;

    // Select category IDs
    const targetCatId = catMap[item.cat] || defaultAbayaCatId;
    const categoryIds = [targetCatId];
    if (defaultAbayaCatId && targetCatId !== defaultAbayaCatId) {
      categoryIds.push(defaultAbayaCatId);
    }

    // Select 2-3 images
    const img1 = imagePool[(i * 3) % imagePool.length];
    const img2 = imagePool[(i * 3 + 1) % imagePool.length];
    const img3 = imagePool[(i * 3 + 2) % imagePool.length];
    const prodImages = [img1, img2, img3];

    // Find fabric value ID
    const matchedFabric = fabricValues.find((f) => f.value.toLowerCase().includes(item.fabric.toLowerCase())) || fabricValues[0];

    // Create product
    const prod = await prisma.products.create({
      data: {
        name: item.name,
        slug: uniqueSlug,
        description: `<p>${item.desc}</p><p>Featuring reinforced French seams, breathable fabric weave, and designed for dignified modesty in everyday and formal settings.</p><ul><li>Tailored in the United Arab Emirates</li><li>Material: ${item.fabric}</li><li>Care: Dry clean or delicate cold wash</li></ul>`,
        short_description: item.desc.substring(0, 150) + '...',
        sku_prefix: skuPrefix,
        status: product_status.PUBLISHED,
        is_featured: i % 4 === 0,
        published_at: new Date(),
      },
    });

    // Link Categories
    await prisma.product_categories.createMany({
      data: categoryIds.map((cid) => ({ product_id: prod.id, category_id: cid })),
    });

    // Link Images
    await prisma.product_images.createMany({
      data: prodImages.map((url, idx) => ({
        product_id: prod.id,
        image_url: url,
        is_thumbnail: idx === 0,
        sort_order: idx + 1,
      })),
    });

    // Create 3 standard variants: Sizes 52, 54, 56
    const sizesToUse = sizeValues.length > 0 ? sizeValues.slice(0, 3) : [{ id: null, value: '54' }];
    const colorToUse = colorValues[i % colorValues.length] || colorValues[0];

    for (const sizeVal of sizesToUse) {
      const variantSku = `${skuPrefix}-${sizeVal.value || 'STD'}`;
      const stockQty = 15 + ((i * 7 + counter) % 45); // between 15 and 60 units

      const variant = await prisma.product_variants.create({
        data: {
          product_id: prod.id,
          sku: variantSku,
          price: item.price,
          compare_price: item.compare,
          status: variant_status.ACTIVE,
        },
      });

      // Link Attribute values
      const attrLinks = [];
      if (colorToUse?.id) attrLinks.push({ variant_id: variant.id, attribute_value_id: colorToUse.id });
      if (sizeVal?.id) attrLinks.push({ variant_id: variant.id, attribute_value_id: sizeVal.id });
      if (matchedFabric?.id) attrLinks.push({ variant_id: variant.id, attribute_value_id: matchedFabric.id });

      if (attrLinks.length > 0) {
        await prisma.variant_attribute_values.createMany({ data: attrLinks });
      }

      // Create Inventory
      await prisma.inventory.create({
        data: {
          variant_id: variant.id,
          warehouse_id: warehouse.id,
          quantity: stockQty,
          available_quantity: stockQty,
          reserved_quantity: 0,
        },
      });

      // Attach Flash Sale offer to every 5th product
      if (i % 5 === 0 && flashOffer) {
        await prisma.offer_products.create({
          data: {
            offer_id: flashOffer.id,
            variant_id: variant.id,
          },
        });
      }
    }

    insertedCount++;
    if (insertedCount % 20 === 0 || insertedCount === productsToCreate.length) {
      console.log(`Inserted ${insertedCount}/${productsToCreate.length} products...`);
    }
  }

  const finalCount = await prisma.products.count();
  console.log(`\nSUCCESS! Database now contains ${finalCount} total products! (Inserted ${insertedCount} new products)`);
}

seed150Products()
  .catch((err) => {
    console.error('Error during seeding:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

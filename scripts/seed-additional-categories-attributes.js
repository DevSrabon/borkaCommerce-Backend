const { PrismaClient } = require('@prisma/client');

async function seedCategoriesAndAttributes() {
  const prodUrl = process.env.DATABASE_URL || 'postgresql://saba:TMvqZbtRJPma5L7fizH4@72.60.99.32:5432/saba?schema=public';
  console.log('Connecting to database...');
  const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

  try {
    console.log('--- 1. SEEDING CATEGORIES ---');
    const newCategories = [
      {
        name: 'Hijabs & Shaylas',
        slug: 'hijabs-shaylas',
        description: 'Flowing luxury chiffon, jersey, and modal scarves',
        image: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80',
        sort_order: 2,
        show_in_navbar: true,
        show_on_homepage: true,
        children: [
          {
            name: 'Chiffon Hijabs',
            slug: 'chiffon-hijabs',
            description: 'Breathable, non-slip everyday luxury chiffon',
            image: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80',
            sort_order: 1,
            show_in_navbar: true,
          },
          {
            name: 'Jersey Hijabs',
            slug: 'jersey-hijabs',
            description: 'Ultra-stretch pin-free premium modal jersey',
            image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
            sort_order: 2,
            show_in_navbar: true,
          },
          {
            name: 'Silk Georgette Scarves',
            slug: 'silk-georgette-scarves',
            description: 'Lustrous festive georgette drapes',
            image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
            sort_order: 3,
            show_in_navbar: true,
          },
        ],
      },
      {
        name: 'Modest Kaftans & Farashas',
        slug: 'kaftans-farashas',
        description: 'Regal Dubai Farashas and festive hand-embellished Kaftans',
        image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
        sort_order: 3,
        show_in_navbar: true,
        show_on_homepage: true,
        children: [
          {
            name: 'Embroidered Dubai Farashas',
            slug: 'dubai-farashas',
            description: 'Flowing wide-sleeved royal silhouettes',
            image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
            sort_order: 1,
            show_in_navbar: true,
          },
          {
            name: 'Moroccan Jalabiyas',
            slug: 'moroccan-jalabiyas',
            description: 'Traditional festive couture with braided sfifa',
            image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80',
            sort_order: 2,
            show_in_navbar: true,
          },
        ],
      },
      {
        name: 'Niqabs & Face Veils',
        slug: 'niqabs',
        description: 'Ultra-breathable modest face veils and Saudi style double-layer niqabs',
        image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        sort_order: 4,
        show_in_navbar: true,
        show_on_homepage: true,
        children: [
          {
            name: 'Single Layer Niqabs',
            slug: 'single-layer-niqabs',
            description: 'Soft elastic eye opening and breathable chiffon',
            image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
            sort_order: 1,
            show_in_navbar: true,
          },
          {
            name: 'Saudi Double Layer Niqabs',
            slug: 'saudi-double-layer-niqabs',
            description: 'Full modest coverage with tying cord',
            image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
            sort_order: 2,
            show_in_navbar: true,
          },
        ],
      },
      {
        name: 'Prayer Dresses & Sets',
        slug: 'prayer-sets',
        description: 'Two-piece prayer sets and travel prayer dresses',
        image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
        sort_order: 5,
        show_in_navbar: true,
        show_on_homepage: true,
        children: [
          {
            name: 'Two-Piece Prayer Sets',
            slug: 'two-piece-prayer-sets',
            description: 'Maxi skirt with flowing matching head drape',
            image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
            sort_order: 1,
            show_in_navbar: true,
          },
          {
            name: 'Travel Prayer Dresses',
            slug: 'travel-prayer-dresses',
            description: 'Wrinkle-free compact travel prayer gown with bag',
            image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
            sort_order: 2,
            show_in_navbar: true,
          },
        ],
      },
      {
        name: 'Accessories & Brooches',
        slug: 'accessories',
        description: 'Snag-free magnetic pins, brooches, and velvet abaya belts',
        image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
        sort_order: 6,
        show_in_navbar: true,
        show_on_homepage: true,
        children: [
          {
            name: 'Magnetic Hijab Pins',
            slug: 'magnetic-pins',
            description: 'Snag-free luxury metallic magnetic pins',
            image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80',
            sort_order: 1,
            show_in_navbar: true,
          },
          {
            name: 'Embellished Belts & Tassels',
            slug: 'belts-tassels',
            description: 'Braided tassel belts and embellished cords',
            image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80',
            sort_order: 2,
            show_in_navbar: true,
          },
        ],
      },
    ];

    for (const cat of newCategories) {
      const parent = await prisma.categories.upsert({
        where: { slug: cat.slug },
        update: {
          name: cat.name,
          description: cat.description,
          image: cat.image,
          sort_order: cat.sort_order,
          show_in_navbar: cat.show_in_navbar,
          show_on_homepage: cat.show_on_homepage,
        },
        create: {
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          image: cat.image,
          sort_order: cat.sort_order,
          show_in_navbar: cat.show_in_navbar,
          show_on_homepage: cat.show_on_homepage,
        },
      });
      console.log(`✓ Root category: ${parent.name} (${parent.slug})`);

      for (const child of cat.children || []) {
        await prisma.categories.upsert({
          where: { slug: child.slug },
          update: {
            name: child.name,
            description: child.description,
            image: child.image,
            sort_order: child.sort_order,
            show_in_navbar: child.show_in_navbar,
            parent_id: parent.id,
          },
          create: {
            name: child.name,
            slug: child.slug,
            description: child.description,
            image: child.image,
            sort_order: child.sort_order,
            show_in_navbar: child.show_in_navbar,
            parent_id: parent.id,
          },
        });
        console.log(`  └─ Subcategory: ${child.name} (${child.slug})`);
      }
    }

    console.log('\n--- 2. SEEDING ATTRIBUTES & VALUES ---');
    const attributesToSeed = [
      {
        name: 'Size',
        values: ['50', '52', '54', '56', '58', '60', 'Bespoke Custom Tailored'],
      },
      {
        name: 'Color',
        values: [
          'Midnight Black',
          'Jet Black',
          'Emerald Forest',
          'Champagne Gold',
          'Dusty Rose',
          'Royal Navy',
          'Mocha Brown',
          'Sage Olive',
          'Deep Burgundy',
          'Pearl White',
          'Charcoal Grey',
        ],
      },
      {
        name: 'Fabric',
        values: [
          'Korean Nida',
          'Ultra-Soft Nida',
          'Pure Mulberry Silk',
          'Japanese Georgette Crepe',
          'Japanese Crepe',
          'Organic Italian Linen',
          'Royal Plush Velvet',
          'Silk Organza',
          'Turkish Medine Silk',
        ],
      },
      {
        name: 'Sleeve Cut',
        values: [
          'Bell Sleeves',
          'Kimono Sleeves',
          'Elasticated Smocked Cuff',
          'Fitted Button Cuff',
          'Batwing Flowing Cut',
        ],
      },
      {
        name: 'Closure Type',
        values: [
          'Front Open Snap Buttons',
          'Closed Pull-Over',
          'Belted Wrap Tie',
          'Concealed Front Zipper',
        ],
      },
      {
        name: 'Length',
        values: ['50 inches', '52 inches', '54 inches', '56 inches', '58 inches', '60 inches'],
      },
    ];

    for (const attr of attributesToSeed) {
      const attribute = await prisma.attributes.upsert({
        where: { name: attr.name },
        update: {},
        create: { name: attr.name },
      });
      console.log(`✓ Attribute: ${attribute.name}`);

      for (const val of attr.values) {
        await prisma.attribute_values.upsert({
          where: {
            attribute_id_value: {
              attribute_id: attribute.id,
              value: val,
            },
          },
          update: {},
          create: {
            attribute_id: attribute.id,
            value: val,
          },
        });
      }
      console.log(`  └─ Synced ${attr.values.length} values for ${attribute.name}`);
    }

    console.log('\nAll categories and attributes seeded successfully!');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seedCategoriesAndAttributes();

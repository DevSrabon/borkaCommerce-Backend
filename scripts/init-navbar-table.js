const { PrismaClient } = require('@prisma/client');

async function main() {
  const prodUrl = process.env.DATABASE_URL || 'postgresql://saba:TMvqZbtRJPma5L7fizH4@72.60.99.32:5432/saba?schema=public';
  console.log('Connecting to PostgreSQL database...');
  const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

  try {
    console.log('Creating table navbar_items if not exists...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS navbar_items (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        category_id VARCHAR(64),
        subcategory_id VARCHAR(64),
        link VARCHAR(255),
        description VARCHAR(500),
        badge VARCHAR(50),
        icon VARCHAR(50),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        custom_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE navbar_items ALTER COLUMN id TYPE VARCHAR(64)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE navbar_items ALTER COLUMN category_id TYPE VARCHAR(64)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE navbar_items ALTER COLUMN subcategory_id TYPE VARCHAR(64)`);
    console.log('Table navbar_items created or verified successfully!');

    // Check existing count
    const existing = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM navbar_items`);
    console.log('Current navbar_items count:', existing[0].count);

    if (existing[0].count < 5) {
      console.log('Seeding initial default navbar tabs...');
      // Fetch categories from DB to link correctly
      const categories = await prisma.categories.findMany({
        where: { parent_id: null },
        include: { children: true },
        orderBy: { sort_order: 'asc' },
      });

      const initialItems = [
        {
          id: 'nav-all-categories',
          name: 'Shop All',
          type: 'ALL_CATEGORIES',
          link: '/catalog',
          description: 'Explore our complete Emirati couture and daily abaya collection',
          badge: null,
          icon: 'Grid',
          sort_order: 1,
          is_active: true,
        },
      ];

      let order = 2;
      for (const cat of categories) {
        initialItems.push({
          id: `nav-cat-${cat.id}`,
          name: cat.name,
          type: 'CATEGORY',
          category_id: cat.id,
          link: `/catalog?category=${cat.slug}`,
          description: cat.description || `Explore ${cat.name} collection`,
          badge: null,
          icon: null,
          sort_order: order++,
          is_active: true,
        });

        // Add subcategories
        if (cat.children && cat.children.length > 0) {
          for (const sub of cat.children.slice(0, 4)) {
            initialItems.push({
              id: `nav-sub-${sub.id}`,
              name: sub.name,
              type: 'SUBCATEGORY',
              category_id: cat.id,
              subcategory_id: sub.id,
              link: `/catalog?category=${sub.slug}`,
              description: sub.description || `${sub.name} collection`,
              badge: null,
              icon: null,
              sort_order: order++,
              is_active: true,
            });
          }
        }
      }

      // Add Offers Tab
      initialItems.push({
        id: 'nav-offers',
        name: 'Offers',
        type: 'OFFER',
        link: '/offers',
        description: 'Exclusive Limited-Time Discounts & Seasonal Offers',
        badge: '20% OFF',
        icon: 'Flame',
        sort_order: order++,
        is_active: true,
      });

      for (const item of initialItems) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO navbar_items (id, name, type, category_id, subcategory_id, link, description, badge, icon, sort_order, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          item.id,
          item.name,
          item.type,
          item.category_id || null,
          item.subcategory_id || null,
          item.link || null,
          item.description || null,
          item.badge || null,
          item.icon || null,
          item.sort_order,
          item.is_active
        );
      }
      console.log(`Seeded ${initialItems.length} navbar items!`);
    }
  } catch (err) {
    console.error('Error initializing navbar table:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

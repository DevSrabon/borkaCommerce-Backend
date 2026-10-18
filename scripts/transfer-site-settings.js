const { PrismaClient } = require('@prisma/client');

const LOCAL_URL = 'postgresql://postgres:1234@localhost:5432/borka_commerce?schema=public';
const PROD_URL = 'postgresql://saba:TMvqZbtRJPma5L7fizH4@72.60.99.32:5432/saba?schema=public';

async function main() {
  console.log('Connecting to Local DB:', LOCAL_URL.replace(/:[^:@]+@/, ':****@'));
  const localPrisma = new PrismaClient({
    datasources: { db: { url: LOCAL_URL } },
  });

  console.log('Connecting to Prod DB:', PROD_URL.replace(/:[^:@]+@/, ':****@'));
  const prodPrisma = new PrismaClient({
    datasources: { db: { url: PROD_URL } },
  });

  try {
    const localSettings = await localPrisma.site_settings.findMany();
    console.log(`Found ${localSettings.length} site_settings records in Local DB.`);

    if (localSettings.length === 0) {
      console.log('No records found in local site_settings to transfer.');
      return;
    }

    let inserted = 0;
    let updated = 0;

    for (const item of localSettings) {
      const existing = await prodPrisma.site_settings.findUnique({
        where: { key: item.key },
      });

      if (existing) {
        await prodPrisma.site_settings.update({
          where: { key: item.key },
          data: { value: item.value },
        });
        updated++;
        console.log(`[UPDATE] ${item.key} = ${item.value.slice(0, 60)}${item.value.length > 60 ? '...' : ''}`);
      } else {
        await prodPrisma.site_settings.create({
          data: {
            key: item.key,
            value: item.value,
          },
        });
        inserted++;
        console.log(`[CREATE] ${item.key} = ${item.value.slice(0, 60)}${item.value.length > 60 ? '...' : ''}`);
      }
    }

    console.log(`\nSuccessfully transferred site_settings:`);
    console.log(`- Created: ${inserted}`);
    console.log(`- Updated: ${updated}`);
    console.log(`- Total processed: ${localSettings.length}`);
  } catch (error) {
    console.error('Transfer failed with error:', error);
    process.exit(1);
  } finally {
    await localPrisma.$disconnect();
    await prodPrisma.$disconnect();
  }
}

main();

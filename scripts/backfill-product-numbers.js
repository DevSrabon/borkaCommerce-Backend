const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
  const products = await prisma.products.findMany({
    orderBy: { created_at: 'asc' },
  });
  console.log(`Found ${products.length} products to check for product_number.`);

  let nextNum = 1000;
  for (const prod of products) {
    if (!prod.product_number) {
      const generated = `P${nextNum}`;
      await prisma.products.update({
        where: { id: prod.id },
        data: { product_number: generated },
      });
      console.log(`Assigned ${generated} to "${prod.name}" (${prod.id})`);
      nextNum++;
    } else {
      console.log(`Product "${prod.name}" already has ${prod.product_number}`);
    }
  }

  console.log('Product number backfill successfully completed.');
  await prisma.$disconnect();
}

backfill().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});

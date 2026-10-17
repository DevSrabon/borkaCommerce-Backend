const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRawUnsafe('SELECT column_name FROM information_schema.columns WHERE table_name = \'notifications\';')
  .then((res) => {
    console.log('Columns in notifications table:', res);
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());

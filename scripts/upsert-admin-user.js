const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('Connecting to PostgreSQL to upsert default admin...');

  const email = 'et.srabon@gmail.com';
  const plainPassword = '12345678';
  const hashedPassword = bcrypt.hashSync(plainPassword, 10);

  // 1. Check if user already exists
  const existing = await prisma.customers.findUnique({
    where: { email },
  });

  let adminUser;
  if (existing) {
    console.log(`Customer ${email} exists. Updating role to ADMIN and setting password...`);
    adminUser = await prisma.customers.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        password: hashedPassword,
        is_blocked: false,
        email_verified: true,
      },
    });
    console.log('Admin user updated:', adminUser.id, adminUser.email, adminUser.role);
  } else {
    console.log(`Customer ${email} does not exist. Creating new admin user...`);
    adminUser = await prisma.customers.create({
      data: {
        id: crypto.randomUUID(),
        first_name: 'Admin',
        last_name: 'Srabon',
        email,
        phone: '+971501234567',
        password: hashedPassword,
        role: 'ADMIN',
        is_blocked: false,
        email_verified: true,
      },
    });
    console.log('Admin user created:', adminUser.id, adminUser.email, adminUser.role);
  }

  // 2. Also ensure site_settings has ADMIN_EMAILS updated
  try {
    const existingSetting = await prisma.site_settings.findUnique({
      where: { key: 'ADMIN_EMAILS' },
    });

    let emails = [email, 'admin@example.com', 'srabon@example.com'];
    if (existingSetting && existingSetting.value) {
      const currentList = existingSetting.value.split(',').map((e) => e.trim()).filter(Boolean);
      emails = [...new Set([email, ...currentList])];
    }

    await prisma.site_settings.upsert({
      where: { key: 'ADMIN_EMAILS' },
      update: { value: emails.join(',') },
      create: {
        id: crypto.randomUUID(),
        key: 'ADMIN_EMAILS',
        value: emails.join(','),
      },
    });
    console.log('Site settings ADMIN_EMAILS updated to:', emails.join(','));
  } catch (err) {
    console.warn('Could not update site_settings ADMIN_EMAILS:', err.message);
  }

  console.log('\nSUCCESS! Default admin user is ready:');
  console.log('Email:', email);
  console.log('Password:', plainPassword);
  console.log('Role:', adminUser.role);
}

main()
  .catch((e) => {
    console.error('Error upserting admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

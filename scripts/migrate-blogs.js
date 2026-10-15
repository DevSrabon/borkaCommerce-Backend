const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MEDIA_ROOT = 'https://media.sabaalwadi.com/saba-media/';

function getFullMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.replace(/^\/+/, '');
  return `${MEDIA_ROOT}${cleanPath}`;
}

function cleanHtmlText(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('Connecting to remote MySQL (saba-ecom)...');
  const conn = await mysql.createConnection({
    host: '72.60.99.32',
    port: 3306,
    user: 'root',
    password: '@saba2025@',
    database: 'saba-ecom',
  });
  console.log('✓ Connected to remote MySQL!');

  // 1. Fetch blog_categories
  const [remoteCategories] = await conn.query('SELECT * FROM blog_categories');
  const catMap = new Map(); // id -> name_en
  for (const c of remoteCategories) {
    catMap.set(c.id, c.name_en || 'Abaya');
  }
  console.log(`✓ Loaded ${remoteCategories.length} blog categories.`);

  // 2. Fetch blog_media
  const [remoteMedia] = await conn.query('SELECT * FROM blog_media');
  const mediaMap = new Map(); // id -> full URL
  for (const m of remoteMedia) {
    if (m.filename) {
      mediaMap.set(m.id, getFullMediaUrl(m.filename));
    }
  }
  console.log(`✓ Loaded ${remoteMedia.length} blog media files.`);

  // 3. Fetch remote blogs
  const [remoteBlogs] = await conn.query('SELECT * FROM blogs ORDER BY id ASC');
  console.log(`\nFound ${remoteBlogs.length} remote blogs to migrate...`);

  let migratedCount = 0;

  for (const rb of remoteBlogs) {
    const slug = rb.slug || (rb.title_en || 'blog').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const title = rb.title_en || 'Untitled Blog Post';
    const categoryName = catMap.get(rb.category_id) || 'Abaya';
    const imageUrl = mediaMap.get(rb.featured_image_id) || null;
    const content = rb.content_en || rb.content_ar || '<p>Content coming soon...</p>';

    // Excerpt: prefer meta_description_en, else first 200 chars of text
    let excerpt = rb.meta_description_en;
    if (!excerpt || !excerpt.trim()) {
      const text = cleanHtmlText(content);
      excerpt = text.length > 200 ? text.substring(0, 197) + '...' : text;
    }

    const views = Number(rb.views) || 0;
    const isPublished = rb.status === 1;
    const publishedAt = rb.created_at ? new Date(rb.created_at) : new Date();

    const localBlog = await prisma.blogs.upsert({
      where: { slug },
      update: {
        title,
        excerpt,
        content,
        featured_image: imageUrl,
        main_image: imageUrl,
        category: categoryName,
        views: Math.max(views, 50),
        is_published: isPublished,
        published_at: publishedAt,
        author: 'Saba Al Wadi',
      },
      create: {
        title,
        slug,
        excerpt,
        content,
        featured_image: imageUrl,
        main_image: imageUrl,
        category: categoryName,
        views: Math.max(views, 50),
        is_published: isPublished,
        published_at: publishedAt,
        author: 'Saba Al Wadi',
      },
    });

    migratedCount++;
    console.log(`  ✓ [${migratedCount}/${remoteBlogs.length}] Migrated: "${title.substring(0, 45)}..." -> /blogs/${localBlog.slug}`);
  }

  // 4. Fetch blog comments if any
  const [remoteComments] = await conn.query('SELECT * FROM blog_comments');
  console.log(`\nFound ${remoteComments.length} remote blog comments.`);
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

  await conn.end();
  await prisma.$disconnect();

  console.log(`\n🎉 SUCCESS! Migrated ${migratedCount} full blog posts with details, images, categories, and views into PostgreSQL!`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

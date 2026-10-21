import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateBlogCommentDto, CreateBlogDto, UpdateBlogDto } from './dto/blogs.dto';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BlogsService implements OnModuleInit {
  private readonly logger = new Logger(BlogsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private mailService: MailService,
  ) {}

  async onModuleInit() {
    await this.seedInitialBlogsIfEmpty();
  }

  private async seedInitialBlogsIfEmpty() {
    try {
      const count = await this.prisma.blogs.count();
      if (count === 0) {
        this.logger.log('Seeding initial luxury blogs to match storefront designs...');
        const initialBlogs = [
          {
            title: 'New Best Abaya Shop in Dubai: 7 Magnificent Reasons to Visit Our Shop',
            slug: 'new-best-abaya-shop-in-dubai-7-magnificent-reasons-to-visit-our-shop',
            excerpt: 'Dubai is globally renowned for luxury and refined modest fashion. Discover why Saba Al Wadi stands as the undisputed premier destination for bespoke, handcrafted abayas.',
            content: `
              <p>Dubai has long stood as the beating heart of luxury modest fashion. In an era where haute couture meets centuries of cultural heritage, women seeking sophistication turn to bespoke abayas that command elegance without compromising on modesty.</p>
              <h3>1. Uncompromising Quality of Japanese Crepe & Velvet</h3>
              <p>Every Saba Al Wadi silhouette is cut from world-class textiles sourced directly from distinguished mills in Japan and France. The weight, drape, and breathability of each fabric ensure sublime comfort throughout the Arabian seasons.</p>
              <h3>2. Hand-Embroidered French Crystal & Beadwork</h3>
              <p>Our master artisans dedicate up to 80 hours per garment, hand-sewing individual crystals, bullion threads, and delicate floral lacework onto lapels and sleeve cuffs.</p>
              <h3>3. Bespoke In-Store & Virtual Tailoring</h3>
              <p>Whether visiting our flagship atelier in Dubai or consulting our private stylists via live chat, each garment can be customized to your precise measurements and sleeve preferences.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=80',
            views: 106,
            published_at: new Date('2026-08-11T10:00:00Z'),
          },
          {
            title: 'Abaya Lamsat Almas: The Ultimate New Bridal Abay in Dubai',
            slug: 'abaya-lamsat-almas-the-ultimate-new-bridal-abay-in-dubai',
            excerpt: 'Crafted for celebratory weddings and grand banquets, Lamsat Almas combines rich silk satin linings with incandescent Swarovski adornments.',
            content: `
              <p>Bridal occasions require an aura that lingers long after the celebration concludes. The Lamsat Almas (Touch of Diamond) collection represents the pinnacle of regal bridal modesty.</p>
              <p>Featuring flowing royal silhouettes, double-faced mulberry silk lining, and cathedral-length borders, this masterpiece embodies grace and pure majesty.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&w=1000&q=80',
            views: 138,
            published_at: new Date('2026-07-31T10:00:00Z'),
          },
          {
            title: '10 Stunning Reasons to Shop for a Kimono Abaya Online for Effortless Style',
            slug: '10-stunning-reasons-to-shop-for-a-kimono-abaya-online-for-effortless-style',
            excerpt: 'The kimono abaya seamlessly bridges contemporary international silhouettes with dignified modest coverage for daytime and evening transitions.',
            content: `
              <p>The contemporary kimono abaya has rapidly transformed the modest wardrobe. Its open-front fluidity enables effortless pairing with tailored trousers, slip dresses, and festive co-ords.</p>
              <p>Explore ten compelling reasons why adding a kimono-cut abaya to your collection will elevate your daily and event styling.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=80',
            views: 245,
            published_at: new Date('2026-07-27T10:00:00Z'),
          },
          {
            title: 'Discover Luxury: The Qamar Veli Abaya and the Best Abaya Shop in Dubai',
            slug: 'discover-luxury-the-qamar-veli-abaya-and-the-best-abaya-shop-in-dubai',
            excerpt: 'Inspired by celestial moonlight over the desert dunes, the Qamar Veli boasts shimmering metallic filaments and understated luxury.',
            content: `
              <p>The Qamar Veli represents poetry in fabric. Its understated gleam catches evening chandeliers with luminous subtlety, making it our most sought-after signature piece for prestigious galas.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80',
            views: 320,
            published_at: new Date('2026-07-21T10:00:00Z'),
          },
          {
            title: 'The Petaline Grace Abaya: The Undisputed Crown Jewel of the Wedding Abaya Dubai',
            slug: 'the-petaline-grace-abaya-the-undisputed-crown-jewel-of-the-wedding-abaya-dubai',
            excerpt: 'Petaline Grace redefines bridal splendor with micro-pleated tulle borders and delicate hand-embossed floral appliqués.',
            content: `
              <p>For brides and distinguished mothers of the bride, Petaline Grace offers a timeless silhouette finished with artisanal care.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1000&q=80',
            views: 485,
            published_at: new Date('2026-07-15T10:00:00Z'),
          },
          {
            title: 'Saba Al Wadi: Unveiling the Best Abaya Shop in Dubai for Premium Modest Fashion',
            slug: 'saba-al-wadi-unveiling-the-best-abaya-shop-in-dubai-for-premium-modest-fashion',
            excerpt: 'An insider look into our Dubai atelier where tradition meets forward-thinking modest haute couture.',
            content: `
              <p>At Saba Al Wadi, modest fashion is treated as an art form. Every seam, cut, and bead represents a dedication to dignity, luxury, and empowering femininity.</p>
            `,
            category: 'Abaya',
            featured_image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=80',
            views: 512,
            published_at: new Date('2026-07-10T10:00:00Z'),
          },
        ];

        for (const blogData of initialBlogs) {
          const created = await this.prisma.blogs.create({ data: blogData });
          // Add a sample approved comment to demonstrate comment display
          if (blogData.slug.includes('7-magnificent-reasons')) {
            await this.prisma.blog_comments.create({
              data: {
                blog_id: created.id,
                author_name: 'Srabon Al Mansoori',
                author_email: 'srabon@example.com',
                content: 'MashaAllah, the craftsmanship of your Japanese crepe abayas is unmatched! Visited your Dubai boutique last week and the tailoring was impeccable.',
                status: 'APPROVED',
                created_at: new Date('2026-08-12T14:30:00Z'),
              },
            });
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to seed blogs:', e);
    }
  }

  // ==========================================
  // PUBLIC STOREFRONT METHODS
  // ==========================================

  async getAllBlogs(query?: { search?: string; category?: string; sort?: 'latest' | 'popular' }) {
    const where: any = { is_published: true };

    if (query?.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { excerpt: { contains: term, mode: 'insensitive' } },
        { content: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query?.category?.trim() && query.category.toLowerCase() !== 'all') {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    const orderBy: any =
      query?.sort === 'popular'
        ? [{ views: 'desc' }, { published_at: 'desc' }]
        : [{ published_at: 'desc' }, { created_at: 'desc' }];

    const blogs = await this.prisma.blogs.findMany({
      where,
      orderBy,
      include: {
        _count: {
          select: {
            comments: {
              where: { status: 'APPROVED' },
            },
          },
        },
      },
    });

    return blogs.map((b) => ({
      ...b,
      comments_count: b._count.comments,
    }));
  }

  async getLatestBlogs(limit = 5) {
    return this.prisma.blogs.findMany({
      where: { is_published: true },
      orderBy: { published_at: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        featured_image: true,
        main_image: true,
        published_at: true,
        views: true,
        category: true,
      },
    });
  }

  async getPopularBlogs(limit = 5) {
    return this.prisma.blogs.findMany({
      where: { is_published: true },
      orderBy: [{ views: 'desc' }, { published_at: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        featured_image: true,
        main_image: true,
        published_at: true,
        views: true,
        category: true,
      },
    });
  }

  async getBlogBySlug(slug: string) {
    const blog = await this.prisma.blogs.findUnique({
      where: { slug },
      include: {
        comments: {
          where: { status: 'APPROVED' },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!blog || !blog.is_published) {
      throw new NotFoundException(`Blog post "${slug}" not found`);
    }

    // Increment views asynchronously
    this.prisma.blogs.update({
      where: { id: blog.id },
      data: { views: { increment: 1 } },
    }).catch(() => {});

    return {
      ...blog,
      views: blog.views + 1,
    };
  }

  async createComment(blogId: string, dto: CreateBlogCommentDto) {
    const blog = await this.prisma.blogs.findUnique({
      where: { id: blogId },
    });

    if (!blog) {
      throw new NotFoundException('Blog post not found');
    }

    const comment = await this.prisma.blog_comments.create({
      data: {
        blog_id: blogId,
        author_name: dto.author_name.trim(),
        author_email: dto.author_email.trim(),
        content: dto.content.trim(),
        status: 'PENDING', // Requires admin approval
      },
    });

    // Dispatch real-time admin notification and email
    try {
      await this.notificationsService.createNotification({
        type: 'BLOG_COMMENT',
        title: 'New Blog Comment',
        message: `${dto.author_name.trim()} commented on "${blog.title}": "${dto.content.trim().slice(0, 80)}"`,
        link: '/admin/blogs',
        metadata: {
          blog_id: blog.id,
          blog_title: blog.title,
          author_name: dto.author_name.trim(),
          author_email: dto.author_email.trim(),
        },
      });
      await this.mailService.sendAdminNewBlogCommentNotification(comment, blog);
    } catch (_) {}

    return {
      message: 'Comment submitted successfully! It will appear once approved by admin.',
      comment,
    };
  }

  async getCategories(): Promise<string[]> {
    const settingRow = await this.prisma.site_settings.findUnique({
      where: { key: 'BLOG_CATEGORIES' },
    });

    if (settingRow?.value) {
      try {
        const parsed = JSON.parse(settingRow.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: string) => s.trim()).filter(Boolean);
        }
      } catch {
        const split = settingRow.value.split(',').map((s) => s.trim()).filter(Boolean);
        if (split.length > 0) return split;
      }
    }

    // Default categories if setting doesn't exist yet
    const blogCats = await this.prisma.blogs.findMany({
      select: { category: true },
      distinct: ['category'],
    });

    const defaultCats = ['Abaya', 'Bridal', 'Modest Fashion', 'Haute Couture', 'Styling Tips'];
    const combined = new Set<string>();
    [...defaultCats, ...blogCats.map((b) => b.category)].forEach((c) => {
      if (c && c.trim()) combined.add(c.trim());
    });
    const list = Array.from(combined);

    // Save initial set to site_settings so future updates/deletes are clean
    await this.prisma.site_settings.upsert({
      where: { key: 'BLOG_CATEGORIES' },
      update: { value: JSON.stringify(list) },
      create: { key: 'BLOG_CATEGORIES', value: JSON.stringify(list) },
    }).catch(() => {});

    return list;
  }

  async getCategoriesWithStats(): Promise<Array<{ name: string; count: number }>> {
    const categories = await this.getCategories();
    const blogCounts = await this.prisma.blogs.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    const countMap = new Map<string, number>();
    blogCounts.forEach((bc) => {
      if (bc.category) {
        countMap.set(bc.category.toLowerCase().trim(), bc._count.id);
      }
    });

    return categories.map((cat) => ({
      name: cat,
      count: countMap.get(cat.toLowerCase().trim()) || 0,
    }));
  }

  async addCategory(name: string): Promise<string[]> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('Category name cannot be empty');
    }

    const categories = await this.getCategories();
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      throw new BadRequestException(`Category "${trimmed}" already exists`);
    }

    categories.push(trimmed);

    await this.prisma.site_settings.upsert({
      where: { key: 'BLOG_CATEGORIES' },
      update: { value: JSON.stringify(categories) },
      create: { key: 'BLOG_CATEGORIES', value: JSON.stringify(categories) },
    });

    return categories;
  }

  async updateCategory(oldName: string, newName: string): Promise<string[]> {
    const trimmedOld = oldName?.trim();
    const trimmedNew = newName?.trim();

    if (!trimmedOld || !trimmedNew) {
      throw new BadRequestException('Both current and new category names are required');
    }

    let categories = await this.getCategories();
    const index = categories.findIndex((c) => c.toLowerCase() === trimmedOld.toLowerCase());

    if (index === -1) {
      // If old category wasn't explicitly saved in settings, check if new name collides
      const clash = categories.some((c) => c.toLowerCase() === trimmedNew.toLowerCase());
      if (clash) {
        throw new BadRequestException(`Category "${trimmedNew}" already exists`);
      }
      categories.push(trimmedNew);
    } else {
      // Check collision with another category
      const clashIndex = categories.findIndex((c) => c.toLowerCase() === trimmedNew.toLowerCase());
      if (clashIndex !== -1 && clashIndex !== index) {
        throw new BadRequestException(`Category "${trimmedNew}" already exists`);
      }
      categories[index] = trimmedNew;
    }

    // 1. Update site_settings
    await this.prisma.site_settings.upsert({
      where: { key: 'BLOG_CATEGORIES' },
      update: { value: JSON.stringify(categories) },
      create: { key: 'BLOG_CATEGORIES', value: JSON.stringify(categories) },
    });

    // 2. Cascade update all existing blogs with this category
    await this.prisma.blogs.updateMany({
      where: {
        category: {
          equals: trimmedOld,
          mode: 'insensitive',
        },
      },
      data: {
        category: trimmedNew,
      },
    });

    return categories;
  }

  async deleteCategory(name: string): Promise<string[]> {
    const trimmed = name?.trim().toLowerCase();
    let categories = await this.getCategories();
    categories = categories.filter((c) => c.toLowerCase() !== trimmed);

    await this.prisma.site_settings.upsert({
      where: { key: 'BLOG_CATEGORIES' },
      update: { value: JSON.stringify(categories) },
      create: { key: 'BLOG_CATEGORIES', value: JSON.stringify(categories) },
    });

    return categories;
  }

  // ==========================================
  // ADMIN MANAGEMENT METHODS
  // ==========================================

  async adminGetAllBlogs(query?: { search?: string }) {
    const where: any = {};
    if (query?.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }

    const blogs = await this.prisma.blogs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });

    return blogs.map((b) => ({
      ...b,
      total_comments: b._count.comments,
    }));
  }

  async adminGetBlogById(id: string) {
    const blog = await this.prisma.blogs.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!blog) {
      throw new NotFoundException(`Blog #${id} not found`);
    }

    return blog;
  }

  async adminCreateBlog(dto: CreateBlogDto) {
    let finalSlug = dto.slug?.trim() ? slugify(dto.slug) : slugify(dto.title);
    if (!finalSlug) {
      finalSlug = 'blog-' + Date.now();
    }

    // Check slug uniqueness
    const existing = await this.prisma.blogs.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    return this.prisma.blogs.create({
      data: {
        title: dto.title.trim(),
        slug: finalSlug,
        excerpt: dto.excerpt?.trim() || null,
        content: dto.content,
        featured_image: dto.featured_image?.trim() || null,
        main_image: dto.main_image?.trim() || null,
        category: dto.category?.trim() || 'Abaya',
        author: dto.author?.trim() || 'Saba Al Wadi',
        is_published: dto.is_published ?? true,
        published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
      },
    });
  }

  async adminUpdateBlog(id: string, dto: UpdateBlogDto) {
    const blog = await this.prisma.blogs.findUnique({ where: { id } });
    if (!blog) {
      throw new NotFoundException(`Blog #${id} not found`);
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.slug !== undefined) {
      let slug = slugify(dto.slug || dto.title || '');
      if (slug && slug !== blog.slug) {
        const existing = await this.prisma.blogs.findUnique({ where: { slug } });
        if (existing && existing.id !== id) {
          slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }
        data.slug = slug;
      }
    }
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt?.trim() || null;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.featured_image !== undefined) data.featured_image = dto.featured_image?.trim() || null;
    if (dto.main_image !== undefined) data.main_image = dto.main_image?.trim() || null;
    if (dto.category !== undefined) data.category = dto.category?.trim() || 'Abaya';
    if (dto.author !== undefined) data.author = dto.author?.trim() || 'Saba Al Wadi';
    if (dto.is_published !== undefined) data.is_published = dto.is_published;
    if (dto.published_at !== undefined) data.published_at = new Date(dto.published_at);

    return this.prisma.blogs.update({
      where: { id },
      data,
    });
  }

  async adminDeleteBlog(id: string) {
    const blog = await this.prisma.blogs.findUnique({ where: { id } });
    if (!blog) {
      throw new NotFoundException(`Blog #${id} not found`);
    }
    return this.prisma.blogs.delete({ where: { id } });
  }

  async adminGetAllComments(query?: { status?: string; blogId?: string }) {
    const where: any = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status;
    }
    if (query?.blogId) {
      where.blog_id = query.blogId;
    }

    return this.prisma.blog_comments.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        blog: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });
  }

  async adminUpdateCommentStatus(commentId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') {
    const comment = await this.prisma.blog_comments.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException(`Comment #${commentId} not found`);
    }

    return this.prisma.blog_comments.update({
      where: { id: commentId },
      data: { status },
      include: {
        blog: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });
  }

  async adminDeleteComment(commentId: string) {
    const comment = await this.prisma.blog_comments.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException(`Comment #${commentId} not found`);
    }
    return this.prisma.blog_comments.delete({ where: { id: commentId } });
  }
}

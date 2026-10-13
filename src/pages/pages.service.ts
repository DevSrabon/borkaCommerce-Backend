import {
  Injectable,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';

@Injectable()
export class PagesService implements OnModuleInit {
  private readonly logger = new Logger(PagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultAboutUsPage();
  }

  // ─── Public Storefront ───────────────────────────────────────────────────

  async getPublishedBySlug(slug: string) {
    const cleanSlug = slug.toLowerCase().trim();
    const page = await this.prisma.pages.findUnique({
      where: { slug: cleanSlug },
    });

    if (!page || !page.is_published) {
      throw new NotFoundException(`Page '${cleanSlug}' not found or is currently private`);
    }

    return page;
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────────────

  async getAllPages(search?: string) {
    const where: any = {};
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { slug: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.pages.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        is_published: true,
        meta_title: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async getPageById(id: string) {
    const page = await this.prisma.pages.findUnique({
      where: { id },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  async createPage(dto: CreatePageDto) {
    const cleanSlug = this.sanitizeSlug(dto.slug || dto.title);

    const existing = await this.prisma.pages.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      throw new ConflictException(`A page with the slug '${cleanSlug}' already exists.`);
    }

    return this.prisma.pages.create({
      data: {
        title: dto.title.trim(),
        slug: cleanSlug,
        content: dto.content || JSON.stringify([]),
        html_cache: dto.html_cache || null,
        meta_title: dto.meta_title || dto.title,
        meta_description: dto.meta_description || null,
        is_published: dto.is_published ?? false,
      },
    });
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    const page = await this.prisma.pages.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.slug !== undefined) {
      const cleanSlug = this.sanitizeSlug(dto.slug);
      if (cleanSlug !== page.slug) {
        const existing = await this.prisma.pages.findUnique({
          where: { slug: cleanSlug },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(`Slug '${cleanSlug}' is already in use by another page.`);
        }
        data.slug = cleanSlug;
      }
    }
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.html_cache !== undefined) data.html_cache = dto.html_cache;
    if (dto.meta_title !== undefined) data.meta_title = dto.meta_title;
    if (dto.meta_description !== undefined) data.meta_description = dto.meta_description;
    if (dto.is_published !== undefined) data.is_published = dto.is_published;

    return this.prisma.pages.update({
      where: { id },
      data,
    });
  }

  async deletePage(id: string) {
    const page = await this.prisma.pages.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return this.prisma.pages.delete({ where: { id } });
  }

  // ─── Helpers & Seeding ───────────────────────────────────────────────────

  private sanitizeSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async seedDefaultAboutUsPage() {
    const existing = await this.prisma.pages.findUnique({
      where: { slug: 'about-us' },
    });

    if (existing) {
      return;
    }

    this.logger.log('Seeding default luxurious About Us page with WordPress-style block tree...');

    const defaultBlocks = [
      {
        id: 'block-hero-1',
        type: 'HERO',
        data: {
          badge: 'The House of Modesty & Prestige',
          title: 'Elegance Rooted in Grace, Modesty & Perfection',
          subtitle:
            'Crafted for women who cherish timeless elegance. Every thread, pleat, and hand-embroidered motif celebrates heritage and contemporary modest couture.',
          alignment: 'center',
          background_type: 'gradient',
          primary_button: { label: 'Explore Our Collections', url: '/catalog' },
          secondary_button: { label: 'Our Story & Heritage', url: '#story' },
        },
      },
      {
        id: 'block-story-1',
        type: 'TWO_COLUMN',
        data: {
          heading: 'Our Story & Bespoke Artistry',
          subheading: 'SINCE 2021 — DUBAI & DHAKA',
          content:
            'BorkaCommerce was born out of a profound passion for modest fashion that refuses to compromise on quality, comfort, or architectural silhouette. \n\nWe source only the finest imported Korean Nida, pure Japanese Crepe, and breathable modal linens. Each abaya is meticulously cut and finished by master artisans who have perfected the craft of subtle luxury over generations.',
          image_url:
            'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
          image_position: 'left',
          highlights: [
            '100% Breathable & Lightweight Imported Fabrics',
            'Hand-embellished crystal & zardozi embroidery',
            'Tailored fits with flowing, modest silhouettes',
            'Ethically produced with zero fast-fashion waste',
          ],
          cta_button: { label: 'View New Arrivals', url: '/catalog' },
        },
      },
      {
        id: 'block-stats-1',
        type: 'STATS_COUNTER',
        data: {
          title: 'Recognized for Excellence Worldwide',
          stats: [
            { number: '25,000+', label: 'Delighted Clients Globally' },
            { number: '100%', label: 'Premium Pure Imported Silk & Nida' },
            { number: '35+', label: 'Countries Shipped To Express' },
            { number: '4.9/5', label: 'Customer Satisfaction Score' },
          ],
        },
      },
      {
        id: 'block-features-1',
        type: 'FEATURES_GRID',
        data: {
          heading: 'The Four Pillars of Our Craft',
          subtitle: 'Why discerning connoisseurs choose our atelier',
          columns: 4,
          items: [
            {
              icon: 'Sparkles',
              title: 'Master Tailoring',
              description:
                'Patterned with graceful drapery that flows effortlessly, offering complete modesty without sacrificing silhouette.',
            },
            {
              icon: 'Shield',
              title: 'Unrivaled Textiles',
              description:
                'Directly imported fabrics that remain cool in summer, drape weightlessly, and resist wrinkling throughout the day.',
            },
            {
              icon: 'Truck',
              title: 'Global Express Concierge',
              description:
                'Complimentary express shipping across UAE & Bangladesh, with secure DHL doorstep delivery worldwide.',
            },
            {
              icon: 'Award',
              title: 'Bespoke Alteration Support',
              description:
                'Our dedicated concierge team is available to assist with custom length, sleeve adjustments, and styling advice.',
            },
          ],
        },
      },
      {
        id: 'block-testimonials-1',
        type: 'TESTIMONIALS',
        data: {
          title: 'Praised by Discerning Connoisseurs',
          subtitle: 'What our clients share about their experiences',
          items: [
            {
              quote:
                'The craftsmanship of the royal velvet embellished abaya took my breath away. The fabric feels like liquid silk and the drape is absolute royalty.',
              author: 'Ayesha Al-Nuaimi',
              role: 'Dubai, UAE',
              rating: 5,
            },
            {
              quote:
                'Ordering from Dhaka was seamless. Fast express delivery, premium packaging with lavender sachet, and the stitch work is unmatched.',
              author: 'Tasneem Rahman',
              role: 'Dhaka, Bangladesh',
              rating: 5,
            },
            {
              quote:
                'Finally a luxury modest fashion brand that understands both traditional modest sensibilities and high-fashion aesthetics. Truly five stars.',
              author: 'Fatima Zahra',
              role: 'London, UK',
              rating: 5,
            },
          ],
        },
      },
      {
        id: 'block-faq-1',
        type: 'FAQ_ACCORDION',
        data: {
          title: 'Frequently Asked Questions',
          subtitle: 'Everything you need to know about our atelier and services',
          items: [
            {
              question: 'How do I determine the right size for my height?',
              answer:
                'Our abayas are designed by length standard (50, 52, 54, 56, 58, 60 inches) correlating to your barefoot height. You can refer to our interactive Size Guide or message our 24/7 Live Concierge chat for instant assistance.',
            },
            {
              question: 'What are the recommended washing and care instructions?',
              answer:
                'We advise dry clean only for hand-beaded and embroidered pieces. Plain daily wear Nida abayas can be gently hand-washed in cold water with mild silk detergent and steam ironed on low.',
            },
            {
              question: 'Do you offer international worldwide shipping?',
              answer:
                'Yes, we ship globally to over 35 countries via DHL Express and Aramex, with typical delivery within 3-5 business days.',
            },
          ],
        },
      },
      {
        id: 'block-cta-1',
        type: 'CTA_BANNER',
        data: {
          title: 'Experience the Art of Modest Luxury',
          subtitle:
            'Join our privileged circle and discover handcrafted garments designed to inspire reverence and grace.',
          button_text: 'Shop The Collection',
          button_link: '/catalog',
        },
      },
    ];

    await this.prisma.pages.create({
      data: {
        title: 'About Us',
        slug: 'about-us',
        content: JSON.stringify(defaultBlocks),
        meta_title: 'About Us | The House of Modest Luxury Couture',
        meta_description:
          'Discover our heritage, master craftsmanship, and commitment to timeless modest abayas and couture.',
        is_published: true,
      },
    });

    this.logger.log('Default About Us page created successfully with 7 rich blocks.');
  }
}

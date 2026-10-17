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
    await this.seedDefaultPages();
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

  async getAllPages(search?: string, limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;
    const where: any = {};
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { slug: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.pages.findMany({
        where,
        take,
        skip: skipCount,
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
      }),
      this.prisma.pages.count({ where }),
    ]);

    return { items, total };
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

  async seedDefaultPages() {
    const contactBlocks = [
      {
        id: 'contact-hero',
        type: 'HERO',
        data: {
          badge: 'Get in Touch',
          title: 'Have a question or need support?',
          subtitle: 'We are here to help. Fill out the form below and we will get back to you as soon as possible.',
          alignment: 'center',
          background_type: 'gradient',
          primary_button: { label: 'Call Us Now', url: 'tel:+971556424758' },
          secondary_button: { label: 'Send a Message', url: '#contact-form-section' },
        },
      },
      {
        id: 'contact-form-block',
        type: 'CONTACT_FORM',
        data: {
          contact_info_badge: 'Contact Information',
          contact_info_title: 'Get in Touch with Our Team',
          contact_info_subtitle: 'Have a question or need support? We are here to help. Fill out the form below and we will get back to you as soon as possible.',
          branches: [
            'Suit No: M-49, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
            'Suit No: M-104, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
            'Suit No: M-16, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
          ],
          email: 'contact@sabaalwadi.com',
          phones: [
            { label: 'Tel', number: '+971 55 642 4758' },
            { label: 'Mob', number: '+971 55 79 17 409' },
            { label: 'Mob', number: '+971 55 467 5285', note: 'Suit No: M-16 Contact Number' },
            { label: 'Mob', number: '+971 50 93 75 919' },
          ],
          business_hours: 'Sat-Thu 09:00am-11:00pm (09:00-23:00) Friday 04:00pm-10:00pm (16:00-22:00)',
          timezone: '(UTC+4:00) Abu Dhabi, Muscat',
          form_title: 'Send us a Message',
          form_subtitle: 'We love to hear from you. Fill out the form below to get in touch.',
        },
      },
      {
        id: 'contact-map',
        type: 'MAP',
        data: {
          title: 'Our Location',
          subtitle: 'Visit our flagship showrooms in Abu Hail Centre, Deira-Dubai',
          map_url: 'https://maps.google.com/maps?q=Abu+Hail+Centre+Deira+Dubai&t=&z=15&ie=UTF8&iwloc=&output=embed',
          address: 'Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
          phone: '+971 55 642 4758 / +971 55 79 17 409',
          email: 'contact@sabaalwadi.com',
          hours: 'Sat-Thu: 09:00am - 11:00pm | Fri: 04:00pm - 10:00pm',
          map_height: 440,
          layout: 'split',
          show_card: true,
        },
      },
    ];

    const aboutBlocks = [
      {
        id: 'about-hero',
        type: 'HERO',
        data: {
          badge: 'About SABA AL WADI',
          title: 'Your Trusted E-Commerce Partner',
          subtitle: 'Dedicated to providing exceptional products and services tailored to meet your unique needs.',
          alignment: 'center',
          background_type: 'gradient',
          primary_button: { label: 'Explore Products', url: '/catalog' },
          secondary_button: { label: 'Who We Are', url: '#who-we-are' },
        },
      },
      {
        id: 'about-who-we-are',
        type: 'TWO_COLUMN',
        data: {
          heading: 'Who We Are',
          subheading: 'SABA AL WADI PREMIER ONLINE DESTINATION',
          content: 'SABA AL WADI is a premier online shopping destination, known for our wide range of high-quality products and our dedication to customer satisfaction. Our platform is built on trust, innovation, and a passion for providing exceptional shopping experiences.\n\nSince our inception, we have been committed to offering top-quality products and excellent customer service, tailored to meet the unique needs of every shopper.',
          image_url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
          image_position: 'left',
          highlights: [
            'Premier online shopping destination',
            'Wide range of high-quality products',
            'Built on trust, innovation, and passion',
            'Tailored customer service for every shopper',
          ],
          cta_button: { label: 'Shop Collections', url: '/catalog' },
        },
      },
      {
        id: 'about-services',
        type: 'FEATURES_GRID',
        data: {
          heading: 'Our Services',
          subtitle: 'Comprehensive solutions designed to elevate your shopping experience',
          columns: 3,
          items: [
            {
              icon: 'Sparkles',
              title: 'Wide Range of Products',
              description: 'From fashion and electronics to home essentials, we have everything you need.',
            },
            {
              icon: 'Truck',
              title: 'Fast & Reliable Delivery',
              description: 'We ensure your orders reach you on time, every time.',
            },
            {
              icon: 'Headset',
              title: '24/7 Customer Support',
              description: "We're here for you anytime you need assistance.",
            },
          ],
        },
      },
      {
        id: 'about-why-choose-us',
        type: 'FEATURES_GRID',
        data: {
          heading: 'Why Choose Us?',
          subtitle: 'Principles and commitments that define our standard of excellence',
          columns: 4,
          items: [
            {
              icon: 'Heart',
              title: 'Customer-Centric Approach',
              description: 'Your satisfaction is our top priority. We listen to your feedback and continuously improve our services.',
            },
            {
              icon: 'Shield',
              title: 'Quality Assurance',
              description: 'We only offer products we believe in, thoroughly testing each item for quality and durability.',
            },
            {
              icon: 'CheckCircle2',
              title: 'Transparency',
              description: 'No hidden costs or surprises. We maintain clear and transparent communication at every step.',
            },
            {
              icon: 'Award',
              title: 'Innovative Solutions',
              description: 'We leverage the latest technology to provide a seamless and enjoyable online shopping experience.',
            },
          ],
        },
      },
      {
        id: 'about-mission-vision',
        type: 'TWO_COLUMN',
        data: {
          heading: 'Our Mission & Vision',
          subheading: 'INTEGRITY & CONTINUOUS INNOVATION',
          content: 'Our Mission:\nTo provide exceptional products and services, exceeding customer expectations and creating lasting relationships through integrity and innovation.\n\nOur Vision:\nTo become a leading e-commerce brand known for integrity, innovation, and outstanding service, setting new standards in the industry.',
          image_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
          image_position: 'right',
          highlights: [
            'Exceeding customer expectations at every touchpoint',
            'Creating lasting relationships through integrity',
            'Setting new benchmarks in modern e-commerce',
          ],
        },
      },
      {
        id: 'about-team',
        type: 'CTA_BANNER',
        data: {
          title: 'Meet Our Team',
          subtitle: 'Behind every successful business is a team of dedicated professionals. At SABA AL WADI, our diverse team brings together expertise from various fields to create an exceptional shopping experience for you. From our customer service representatives to our logistics experts, each member of our team is committed to delivering.',
          button_text: 'Explore Our Catalog',
          button_link: '/catalog',
        },
      },
    ];

    const privacyBlocks = [
      {
        id: 'privacy-hero',
        type: 'HERO',
        data: {
          badge: 'Privacy & Data Protection',
          title: 'Privacy Policy & Customer Rights',
          subtitle: 'At Saba Al Wadi, we respect your privacy and are committed to protecting your personal data.',
          alignment: 'center',
          background_type: 'gradient',
          primary_button: { label: 'Read Privacy Terms', url: '#privacy-article' },
          secondary_button: { label: 'Contact Support', url: 'mailto:contact@sabalwadi.com' },
        },
      },
      {
        id: 'privacy-article',
        type: 'RICH_TEXT',
        data: {
          title: 'Official Privacy Policy',
          max_width: 'normal',
          html_content: `
            <h2>Introduction</h2>
            <p>At Saba Al Wadi, we respect your privacy and are committed to protecting your personal data. This Privacy Policy will inform you about how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.</p>
            <p>This privacy policy applies to all information collected through our website, mobile applications, and/or any related services, sales, marketing, or events.</p>

            <h2>Information We Collect</h2>
            <h3>Personal Information</h3>
            <ul>
              <li>Name and contact information</li>
              <li>Billing and shipping address</li>
              <li>Payment information</li>
              <li>Account credentials</li>
            </ul>

            <h3>Automatically Collected Information</h3>
            <ul>
              <li>Device information and IP address</li>
              <li>Browsing history and interactions</li>
              <li>Cookies and similar technologies</li>
              <li>Purchase history</li>
            </ul>
            <p>We use this information to provide our services, process transactions, improve our website, communicate with you, and comply with legal obligations.</p>

            <h2>Order Cancellation Policy</h2>
            <p>Order cancellation requests must be made within <strong>24 hours</strong> of placing your order.</p>
            <p>Orders that have been shipped or have entered the fulfillment process cannot be cancelled.</p>

            <h3>Cancellation Process</h3>
            <ol>
              <li>Log in to your account and navigate to your order history.</li>
              <li>Select the order you wish to cancel and click on the "Cancel Order" button.</li>
              <li>Select a reason for cancellation from the dropdown menu.</li>
              <li>Submit your cancellation request.</li>
              <li>You will receive a confirmation email once your cancellation is processed.</li>
            </ol>
            <p>If you are unable to cancel your order online, please contact our customer service team at <strong>contact@sabalwadi.com</strong> or call <strong>+971 55 642 4758</strong> for assistance.</p>

            <h2>Refund Policy</h2>
            <p>Refund requests must be initiated within <strong>10 days</strong> of receiving your order.</p>
            <p>Items must be returned in their original condition with tags attached and in original packaging.</p>

            <h3>Eligible Items for Refund</h3>
            <ul>
              <li>Unworn and unwashed items with all original tags attached</li>
              <li>Items in original packaging (if applicable)</li>
              <li>Items that are defective or materially different from their description</li>
            </ul>

            <h3>Non-Refundable Items</h3>
            <ul>
              <li>Items that have been worn, washed, or altered</li>
              <li>Items marked as 'Final Sale' or 'Non-Returnable'</li>
              <li>Gift cards and downloadable digital products</li>
            </ul>

            <h3>Refund Process</h3>
            <ol>
              <li>Initiate a return request through your account or by contacting customer service.</li>
              <li>Package your items securely with all original tags and packaging.</li>
              <li>Ship your return using the provided return label or your preferred shipping method.</li>
              <li>Once we receive and inspect your return, we will process your refund.</li>
              <li>Refunds will be issued to the original payment method and may take 5-10 business days to appear in your account.</li>
            </ol>
            <p>For any questions regarding our refund policy, please contact our customer service team at <strong>returns@sabalwadu.com</strong>.</p>

            <h2>Data Security</h2>
            <p>We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure.</p>

            <h2>Contact Us</h2>
            <p>If you have questions or concerns about this Privacy Policy, our data practices, or would like to exercise your rights, please contact us at:</p>
            <div style="padding: 1rem; border: 1px solid var(--border, #333); border-radius: 8px; margin: 1rem 0;">
              <p><strong>Saba Al Wadi</strong></p>
              <p>Email: <a href="mailto:contact@sabalwadi.com">contact@sabalwadi.com</a></p>
              <p>Phone: <a href="tel:+971556424758">+971 55 642 4758</a></p>
              <p>Address: Suit No: M-49, 2nd Floor, Al Habtoor Building, Deira-Dubai</p>
            </div>
          `,
        },
      },
    ];

    const termsBlocks = [
      {
        id: 'terms-hero',
        type: 'HERO',
        data: {
          badge: 'Official Agreement',
          title: 'Terms and Conditions',
          subtitle: 'Welcome to SABA AL WADI. Please read these terms and conditions carefully before accessing or using our platform.',
          alignment: 'center',
          background_type: 'gradient',
          primary_button: { label: 'Read Terms', url: '#terms-article' },
          secondary_button: { label: 'Contact Support', url: 'mailto:contact@sabalwadi.com' },
        },
      },
      {
        id: 'terms-article',
        type: 'RICH_TEXT',
        data: {
          title: 'Storefront Terms and Conditions',
          max_width: 'normal',
          html_content: `
            <h2>Introduction & Acceptance of Terms</h2>
            <p>Welcome to SABA AL WADI. These Terms and Conditions constitute a legally binding agreement made between you, whether personally or on behalf of an entity, and SABA AL WADI, concerning your access to and use of our website located at <a href="https://www.sabaalwadi.com" target="_blank" rel="noopener noreferrer">https://www.sabaalwadi.com</a>, as well as any other media form, media channel, mobile website, or mobile application related, linked, or otherwise connected thereto. By accessing, browsing, registering, or purchasing from our platform, you explicitly acknowledge that you have read, understood, and agree to be bound by all of these Terms and Conditions. If you do not agree with all of these terms, then you are expressly prohibited from using our site and you must discontinue use immediately.</p>
            <p>SABA AL WADI reserves the right, in its sole discretion, to modify, amend, or replace these Terms and Conditions at any time and for any reason. We will alert you about any changes by updating the 'Last Updated' date of these Terms and Conditions, and you waive any right to receive specific notice of each such change. It is your responsibility to periodically review these Terms and Conditions to stay informed of updates. Your continued use of the Site after the date such revised Terms and Conditions are posted will be deemed to constitute your acceptance of and agreement to the changes.</p>

            <h2>General Disclaimer & Service Description</h2>
            <p>SABA AL WADI operates as a premier boutique e-commerce marketplace specialized in women's modest clothing and elegant abayas designed in Dubai, UAE. We act as an intermediary connecting talented designers, boutique sellers, and customers globally. While we make every effort to ensure that all details, sizing charts, fabric specifications, product colors, and inventory levels displayed on the website are correct and complete, the information is provided on an 'as is' and 'as available' basis without any warranties of any kind.</p>
            <p>Product images are for illustrative purposes only. Due to differences in monitors, screen resolutions, and lighting during photography, the actual color of products may vary slightly from the images shown. SABA AL WADI does not warrant that product descriptions, images, or pricing content are entirely error-free or complete. In the event of errors, we reserve the right to correct them and update listings accordingly.</p>

            <h2>Order Placement & Booking Terms</h2>
            <p>To purchase products on SABA AL WADI, you must follow the online checkout process. When you place an order, you are making an offer to purchase the selected items from the respective designer under these terms. All orders are subject to product availability and confirmation of the order price. Upon completing a transaction, you will receive an automated email receipt and order number. This email is only an acknowledgment of receipt and does not constitute acceptance or confirmation of your order.</p>
            <p>A binding contract is only formed once your order is processed, payment is authorized, and the item has been shipped by the designer. SABA AL WADI reserves the right to reject or cancel any order at our sole discretion, including cases where fraud is suspected, stock is depleted, or billing details cannot be verified. Customers are responsible for verifying their custom sizing requirements before placing an order to ensure a proper fit.</p>

            <h2>Pricing, Taxes, & Promotions</h2>
            <p>All prices listed on our platform are displayed in United Arab Emirates Dirhams (AED) and are inclusive of standard local Value Added Tax (VAT) where applicable, unless stated otherwise. Shipping rates, delivery fees, and customs duties for international deliveries are calculated at checkout and are the sole responsibility of the customer. While we endeavor to ensure all pricing information is correct, errors can occur. If we discover a pricing error on any item you ordered, we will inform you immediately and give you the option to reconfirm the order at the correct price or cancel it for a full refund.</p>
            <p>Promotional codes, seasonal discount vouchers, and special sale events are offered at the sole discretion of SABA AL WADI. They are subject to specific terms, validity dates, and minimum order requirements. Promo codes cannot be applied retroactively to completed orders or combined with other promotions unless explicitly allowed. SABA AL WADI reserves the right to modify, suspend, or terminate any discount campaign or voucher without prior notice.</p>

            <h2>Payment Terms & Secure Transactions</h2>
            <p>SABA AL WADI provides a secure, fully encrypted checkout experience for our customers. We accept payment through major credit cards, debit cards, and secure online payment gateways. By submitting your billing information, you guarantee that you are authorized to use the chosen payment method and authorize our secure payment processing partners to charge the full amount of your purchase, including shipping and taxes.</p>
            <p>All cardholders are subject to validation checks and authorization by the card issuer. If the issuer of your card refuses to authorize payment, we will not be held liable for order delays or cancellation. To protect against unauthorized transactions and online fraud, SABA AL WADI reserves the right to perform extra verification and security checks, which may include requesting additional proof of identity for high-value transactions.</p>

            <h2>Cancellation, Returns, & Refund Policy</h2>
            <p>Please review our strict guidelines regarding order cancellations and product returns:</p>
            <ul>
              <li><strong>Cancellation Window:</strong> Because many designer abayas are custom tailored or handmade to order, cancellation requests must be made within 48 hours of order placement. Once shipping preparation has begun, the order cannot be cancelled.</li>
              <li><strong>Refund Processing Time:</strong> Refunds for successfully cancelled orders or approved returns will be credited back to your original payment method. The processing can take 3 to 5 business days, depending on bank clearance times.</li>
              <li><strong>Non-Refundable Charges:</strong> Delivery fees, international customs duties, convenience charges, and transaction fees charged by payment providers are non-refundable unless the item sent is verified to be damaged or incorrect.</li>
              <li><strong>Exceptions & Force Majeure:</strong> In the event of global custom delays, extreme weather conditions, or unforeseen logistics issues, delivery timelines may be altered, and cancellation policies will be reviewed case-by-case.</li>
            </ul>

            <h2>Contact Our Legal & Support Team</h2>
            <p>If you have any questions, clarifications, or disputes regarding these Terms and Conditions, or if you need assistance with refunds and order cancellations, please feel free to reach out to our dedicated client support team in Dubai. We are committed to providing you with the best modest shopping experience.</p>
            <p>Email: <a href="mailto:contact@sabalwadi.com">contact@sabalwadi.com</a></p>
          `,
        },
      },
    ];

    const defaultPages = [
      {
        title: 'Contact Us',
        slug: 'contact-us',
        meta_title: 'Contact Us | SABA AL WADI Dubai',
        meta_description: 'Get in touch with SABA AL WADI. Visit our showroom branches in Abu Hail Centre, Deira-Dubai or contact via telephone and email.',
        is_published: true,
        content: JSON.stringify(contactBlocks),
      },
      {
        title: 'Contact Us',
        slug: 'contact',
        meta_title: 'Contact Us | SABA AL WADI Dubai',
        meta_description: 'Get in touch with SABA AL WADI. Visit our showroom branches in Abu Hail Centre, Deira-Dubai or contact via telephone and email.',
        is_published: true,
        content: JSON.stringify(contactBlocks),
      },
      {
        title: 'About SABA AL WADI',
        slug: 'about-us',
        meta_title: 'About SABA AL WADI | Your Trusted E-Commerce Partner',
        meta_description: 'Discover SABA AL WADI — your trusted e-commerce partner dedicated to exceptional products, quality assurance, and customer-first services.',
        is_published: true,
        content: JSON.stringify(aboutBlocks),
      },
      {
        title: 'Privacy Policy',
        slug: 'privacy-policy',
        meta_title: 'Privacy Policy | SABA AL WADI',
        meta_description: 'Learn how SABA AL WADI collects, protects, and handles your personal data, order cancellations, and refunds.',
        is_published: true,
        content: JSON.stringify(privacyBlocks),
      },
      {
        title: 'Terms and Conditions',
        slug: 'terms-conditions',
        meta_title: 'Terms and Conditions | SABA AL WADI',
        meta_description: 'Review the official terms and conditions for SABA AL WADI, including order placement, pricing, payment security, and cancellation terms.',
        is_published: true,
        content: JSON.stringify(termsBlocks),
      },
      {
        title: 'Terms and Conditions',
        slug: 'terms-and-conditions',
        meta_title: 'Terms and Conditions | SABA AL WADI',
        meta_description: 'Review the official terms and conditions for SABA AL WADI, including order placement, pricing, payment security, and cancellation terms.',
        is_published: true,
        content: JSON.stringify(termsBlocks),
      },
    ];

    for (const p of defaultPages) {
      const existing = await this.prisma.pages.findUnique({
        where: { slug: p.slug },
      });
      if (!existing) {
        await this.prisma.pages.create({ data: p });
        this.logger.log(`Default page created: ${p.slug}`);
      }
    }
  }
}

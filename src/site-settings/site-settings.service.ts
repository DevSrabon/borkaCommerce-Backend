import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface DeliveryCalculation {
  base_fee: number;
  final_fee: number;
  discount_amount: number;
  is_free: boolean;
  display_text: string; // 'FREE' or formatted currency
  applied_rule: string | null;
  threshold_rule: string | null;
}

@Injectable()
export class SiteSettingsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  // Default fallback values matching .env lines 4-23 & delivery configuration
  private readonly defaultSettings: Record<string, string> = {
    // Currency & Exchange Rates (Base AED)
    default_currency: 'AED',
    currency_rate_usd: '0.272',
    currency_rate_gbp: '0.213',
    currency_rate_eur: '0.250',
    currency_last_updated: '',

    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS || '',

    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: process.env.SMTP_PORT || '587',
    SMTP_USER: process.env.SMTP_USER || 'notifications@sabaalwadi.ae',
    SMTP_PASS: process.env.SMTP_PASS || 'demo_app_password',
    SMTP_SECURE: process.env.SMTP_SECURE || 'false',
    EMAIL_FROM: process.env.EMAIL_FROM || 'Saba Al Wadi Abayas <no-reply@sabaalwadi.ae>',

    GOOGLE_CLIENT_ID:
      process.env.GOOGLE_CLIENT_ID ||
      '10987654321-googleclientid.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET:
      process.env.GOOGLE_CLIENT_SECRET || 'GOCSPX-mockGoogleSecretKey123',
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || '987654321098765',
    FACEBOOK_APP_SECRET:
      process.env.FACEBOOK_APP_SECRET || 'mockFacebookAppSecretKey456',

    // Cloudflare Turnstile Captcha
    CLOUDFLARE_TURNSTILE_SITE_KEY:
      process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
    CLOUDFLARE_TURNSTILE_SECRET_KEY:
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',

    // Dynamic Delivery & Shipping Configuration
    shipping_base_fee: '30',
    free_shipping_threshold: '500',
    shipping_discount_min_order: '600',
    shipping_discount_type: 'PERCENTAGE', // 'PERCENTAGE' or 'FIXED'
    shipping_discount_value: '30', // 30% off (or 30 AED off)

    // Redis Dynamic Configuration
    REDIS_ENABLED: process.env.REDIS_ENABLED || 'false',
    REDIS_URL: process.env.REDIS_URL || '',

    // Stock Configuration
    low_stock_threshold: '5',
    show_stock_quantity: 'true',
    show_stock_badge: 'true',

    // WhatsApp Order Configuration
    whatsapp_order_enabled: 'true',
    whatsapp_order_number: '+971 55 642 4758',

    // Asset Storage Driver Configuration (local vs cloudinary vs r2 vs s3)
    STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
    CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || 'borkacommerce',

    // Cloudflare R2 Object Storage
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '',
    R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN || '',

    // AWS S3 Object Storage
    AWS_S3_REGION: process.env.AWS_S3_REGION || 'me-central-1',
    AWS_S3_ACCESS_KEY_ID: process.env.AWS_S3_ACCESS_KEY_ID || '',
    AWS_S3_SECRET_ACCESS_KEY: process.env.AWS_S3_SECRET_ACCESS_KEY || '',
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || '',
    // Flash Sale Spotlight Configuration
    flash_sale_enabled: 'true',

    // Tracking & Analytics
    google_analytics_id: process.env.GOOGLE_ANALYTICS_ID || process.env.NEXT_PUBLIC_GA_ID || '',
    facebook_pixel_id: process.env.FACEBOOK_PIXEL_ID || process.env.NEXT_PUBLIC_FB_PIXEL_ID || '',
    google_search_console_tag: process.env.GOOGLE_SEARCH_CONSOLE_TAG || '',

    // Size Chart Configuration (Only file upload)
    size_chart_file: '',

    // Dynamic Footer Configuration
    footer_about_text:
      'Saba Al Wadi is an online business specializing in selling high-quality Abayas, offering a variety of stylish and modest designs for women.',
    footer_phone_1: 'Tel: +971 55 642 4758',
    footer_phone_2: 'Mob: +971 55 79 17 409',
    footer_phone_3: 'Mob: +971 50 93 75 919',
    footer_phone_4: 'Mob: +971 55 467 5285 (Suit No: M-16 Contact Number)',
    footer_email: 'contact@sabaalwadi.com',
    footer_hours_sat_thu: 'Sat-Thu: 09:00am-11:00pm',
    footer_hours_fri: 'Friday: 04:00pm-10:00pm',
    footer_address_1:
      'Suit No: M-49, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
    footer_address_2:
      'Suit No: M-104, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
    footer_address_3:
      'Suit No: M-16, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
    footer_branches_json: JSON.stringify([
      {
        id: 'branch-1',
        name: 'Abu Hail Main Showroom',
        address: 'Suit No: M-49, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
        phone: 'Tel: +971 55 642 4758',
        email: 'abuhail@sabaalwadi.com',
        hours: 'Sat-Thu: 09:00am-11:00pm | Fri: 04:00pm-10:00pm'
      },
      {
        id: 'branch-2',
        name: 'Abu Hail Second Suite',
        address: 'Suit No: M-104, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
        phone: 'Mob: +971 55 79 17 409',
        email: 'deira@sabaalwadi.com',
        hours: 'Sat-Thu: 09:00am-11:00pm'
      },
      {
        id: 'branch-3',
        name: 'Abu Hail Studio & Atelier',
        address: 'Suit No: M-16, 2nd Floor, Al Habtoor Building (Abu Hail Centre), Abu Hail, Deira-Dubai, P.O Box-67242',
        phone: 'Mob: +971 55 467 5285',
        email: 'contact@sabaalwadi.com',
        hours: 'Sat-Thu: 10:00am-10:00pm'
      }
    ]),
    social_facebook: 'https://facebook.com/sabaalwadi',
    social_instagram: 'https://instagram.com/sabaalwadi',
    social_youtube: 'https://youtube.com/@sabaalwadi',
    social_pinterest: 'https://pinterest.com/sabaalwadi',
    social_tiktok: 'https://tiktok.com/@sabaalwadi',
  };

  // ─── Dynamic Setting Getter ──────────────────────────────────────────────

  async getSetting(key: string, fallback?: string): Promise<string> {
    const row = await this.prisma.site_settings.findUnique({
      where: { key },
    });
    if (row && row.value !== undefined && row.value !== null && row.value !== '') {
      return row.value;
    }
    return process.env[key] || this.defaultSettings[key] || fallback || '';
  }

  // ─── Dynamic Delivery & Shipping Calculation ─────────────────────────────

  async calculateDeliveryCharge(subtotal: number): Promise<DeliveryCalculation> {
    const baseFee = parseFloat(await this.getSetting('shipping_base_fee', '30')) || 0;
    const freeThreshold = parseFloat(await this.getSetting('free_shipping_threshold', '500')) || 0;
    const discountMinOrder = parseFloat(await this.getSetting('shipping_discount_min_order', '600')) || 0;
    const discountType = await this.getSetting('shipping_discount_type', 'PERCENTAGE');
    const discountValue = parseFloat(await this.getSetting('shipping_discount_value', '30')) || 0;

    // 1. If base fee is 0, delivery is always FREE
    if (baseFee <= 0) {
      return {
        base_fee: 0,
        final_fee: 0,
        discount_amount: 0,
        is_free: true,
        display_text: 'FREE',
        applied_rule: 'Free standard delivery',
        threshold_rule: null,
      };
    }

    // 2. If subtotal qualifies for free shipping
    if (freeThreshold > 0 && subtotal >= freeThreshold) {
      return {
        base_fee: baseFee,
        final_fee: 0,
        discount_amount: baseFee,
        is_free: true,
        display_text: 'FREE',
        applied_rule: `Free express shipping on orders above AED ${freeThreshold}`,
        threshold_rule: null,
      };
    }

    // 3. If subtotal qualifies for tiered shipping discount
    if (discountMinOrder > 0 && subtotal >= discountMinOrder && discountValue > 0) {
      let discountAmount = 0;
      if (discountType === 'PERCENTAGE') {
        discountAmount = (baseFee * discountValue) / 100;
      } else {
        discountAmount = discountValue;
      }
      const finalFee = Math.max(0, baseFee - discountAmount);
      const isFree = finalFee === 0;

      return {
        base_fee: baseFee,
        final_fee: Number(finalFee.toFixed(2)),
        discount_amount: Number(discountAmount.toFixed(2)),
        is_free: isFree,
        display_text: isFree ? 'FREE' : `${finalFee.toFixed(2)} AED`,
        applied_rule: `${discountValue}${discountType === 'PERCENTAGE' ? '%' : ' AED'} delivery discount applied for orders over AED ${discountMinOrder}`,
        threshold_rule: null,
      };
    }

    // 4. Standard shipping with upsell progress helper
    const remainingForFree = freeThreshold > 0 ? Math.max(0, freeThreshold - subtotal) : 0;
    const thresholdRule =
      remainingForFree > 0
        ? `Add AED ${remainingForFree.toFixed(2)} more to unlock FREE express shipping!`
        : null;

    return {
      base_fee: baseFee,
      final_fee: baseFee,
      discount_amount: 0,
      is_free: baseFee === 0,
      display_text: baseFee === 0 ? 'FREE' : `${baseFee.toFixed(2)} AED`,
      applied_rule: null,
      threshold_rule: thresholdRule,
    };
  }

  // ─── Banners ─────────────────────────────────────────────────────────────

  async getActiveBanners(size_type?: string) {
    return this.prisma.banners.findMany({
      where: {
        is_active: true,
        ...(size_type ? { size_type } : {}),
      },
      orderBy: { sort_order: 'asc' },
    });
  }

  async getAllBanners(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.banners.findMany({
        take,
        skip: skipCount,
        orderBy: { sort_order: 'asc' },
      }),
      this.prisma.banners.count(),
    ]);

    return { items, total };
  }

  async createBanner(dto: {
    title: string;
    subtitle?: string;
    cta_text?: string;
    cta_link?: string;
    image_url: string;
    mobile_image_url?: string;
    alt_text?: string;
    size_type?: string;
    size_description?: string;
    is_active?: boolean;
    sort_order?: number;
  }) {
    return this.prisma.banners.create({ data: dto });
  }

  async updateBanner(
    id: string,
    dto: Partial<{
      title: string;
      subtitle: string;
      cta_text: string;
      cta_link: string;
      image_url: string;
      mobile_image_url: string;
      alt_text: string;
      size_type: string;
      size_description: string;
      is_active: boolean;
      sort_order: number;
    }>
  ) {
    return this.prisma.banners.update({ where: { id }, data: dto });
  }

  async deleteBanner(id: string) {
    return this.prisma.banners.delete({ where: { id } });
  }

  // Allowed public keys for Storefront / Guest visitors (Secrets NEVER exposed)
  private readonly publicSettingKeys = new Set([
    'site_name',
    'site_tagline',
    'logo_url',
    'favicon_url',
    'footer_logo_url',
    'footer_about_text',
    'footer_phone_1',
    'footer_phone_2',
    'footer_phone_3',
    'footer_phone_4',
    'footer_email',
    'footer_hours_sat_thu',
    'footer_hours_fri',
    'footer_address_1',
    'footer_address_2',
    'footer_address_3',
    'footer_branches_json',
    'social_facebook',
    'social_instagram',
    'social_youtube',
    'social_pinterest',
    'social_tiktok',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'shipping_base_fee',
    'free_shipping_threshold',
    'shipping_discount_min_order',
    'shipping_discount_type',
    'shipping_discount_value',
    'flash_sale_enabled',
    'low_stock_threshold',
    'show_stock_quantity',
    'show_stock_badge',
    'whatsapp_order_enabled',
    'whatsapp_order_number',
    'size_chart_file',
    'size_chart_image',
    'size_chart_guide_text',
    'size_chart_table',
    'size_chart_columns',
    'BLOG_CATEGORIES',
    'CLOUDFLARE_TURNSTILE_SITE_KEY', // Only the public client site key
    'google_analytics_id',
    'facebook_pixel_id',
    'google_search_console_tag',
    'GOOGLE_ANALYTICS_ID',
    'FACEBOOK_PIXEL_ID',
    'GOOGLE_CLIENT_ID',
    'FACEBOOK_APP_ID',
    'default_currency',
    'currency_rate_usd',
    'currency_rate_gbp',
    'currency_rate_eur',
    'currency_last_updated',
    'STRIPE_PUBLISHABLE_KEY',
    'stripe_publishable_key',
    'stripe_mode',
    'stripe_configured',
  ]);

  async onModuleInit() {
    this.scheduleNightlyRateSync();
  }

  private rateSyncTimer: NodeJS.Timeout | null = null;

  scheduleNightlyRateSync() {
    const scheduleNext = () => {
      const now = new Date();
      // Calculate next midnight at 00:00:00
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      if (this.rateSyncTimer) {
        clearTimeout(this.rateSyncTimer);
      }

      this.rateSyncTimer = setTimeout(async () => {
        try {
          console.log('[ExchangeRateService] Running scheduled nightly rate synchronization from AED base...');
          await this.syncExchangeRates();
        } catch (e) {
          console.error('[ExchangeRateService] Nightly exchange rate sync failed:', e);
        }
        scheduleNext();
      }, msUntilMidnight);
    };

    scheduleNext();
  }

  async syncExchangeRates(): Promise<{ success: boolean; rates: Record<string, string>; message: string }> {
    try {
      // Free public Open Exchange Rate API for AED base
      const res = await fetch('https://open.er-api.com/v6/latest/AED');
      if (!res.ok) {
        throw new Error(`Exchange rate provider returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data || !data.rates) {
        throw new Error('Invalid rate data format from provider');
      }

      // Base is always AED = 1
      const usdRate = (data.rates.USD ? Number(data.rates.USD).toFixed(4) : '0.2723');
      const gbpRate = (data.rates.GBP ? Number(data.rates.GBP).toFixed(4) : '0.2132');
      const eurRate = (data.rates.EUR ? Number(data.rates.EUR).toFixed(4) : '0.2520');

      const updated = {
        default_currency: 'AED',
        currency_rate_usd: usdRate,
        currency_rate_gbp: gbpRate,
        currency_rate_eur: eurRate,
        currency_last_updated: new Date().toISOString(),
      };

      await this.upsertSettings(updated);

      return {
        success: true,
        rates: updated,
        message: `Successfully synchronized rates from AED base: USD ${usdRate}, GBP ${gbpRate}, EUR ${eurRate}`,
      };
    } catch (err: any) {
      console.error('Exchange rate sync failed:', err);
      return {
        success: false,
        rates: {},
        message: err.message || 'Failed to sync exchange rates',
      };
    }
  }

  async getPublicSettings(): Promise<Record<string, string>> {
    const all = await this.getAllSettings();
    const publicSettings: Record<string, string> = {};
    for (const key of Object.keys(all)) {
      if (this.publicSettingKeys.has(key)) {
        publicSettings[key] = all[key];
      }
    }

    const stripeSecret = all.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    const isLive = stripeSecret.startsWith('sk_live_');
    const isTest = stripeSecret.startsWith('sk_test_');
    const isConfigured = Boolean(stripeSecret && stripeSecret !== 'sk_test_mock' && stripeSecret.trim().length > 10);

    publicSettings['stripe_configured'] = isConfigured ? 'true' : 'false';
    publicSettings['stripe_mode'] = isLive ? 'LIVE' : (isTest ? 'TEST' : (isConfigured ? 'LIVE' : 'TEST'));
    publicSettings['stripe_publishable_key'] =
      all.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';

    return publicSettings;
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.site_settings.findMany();
    const dbSettings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, string>);

    // Merge default fallbacks with database overrides
    return {
      ...this.defaultSettings,
      ...dbSettings,
    };
  }

  async upsertSettings(settings: Record<string, string>) {
    // Keep ADMIN_EMAIL in sync with ADMIN_EMAILS
    if (settings['ADMIN_EMAILS'] !== undefined) {
      const primaryEmail = (settings['ADMIN_EMAILS'] || '')
        .split(',')[0]
        .trim();
      settings['ADMIN_EMAIL'] = primaryEmail;
    }

    const ops = Object.entries(settings).map(([key, value]) => {
      const cleanVal = value !== undefined && value !== null ? String(value) : '';
      return this.prisma.site_settings.upsert({
        where: { key },
        update: { value: cleanVal },
        create: { key, value: cleanVal },
      });
    });
    await Promise.all(ops);
    return this.getAllSettings();
  }

  // ─── Google Translate API Integration ─────────────────────────────────────

  private readonly translationCache = new Map<string, string>();

  async translateWithGoogle(text: string, sl = 'en', tl = 'ar'): Promise<string> {
    if (!text || !text.trim()) return '';
    const trimmed = text.trim();
    const cacheKey = `${sl}_${tl}_${trimmed}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey)!;
    }

    try {
      const apiKey = await this.getSetting('GOOGLE_TRANSLATE_API_KEY');
      if (apiKey && apiKey.trim()) {
        const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey.trim())}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: trimmed, source: sl, target: tl, format: 'text' }),
        });
        if (res.ok) {
          const json = await res.json();
          const translated = json?.data?.translations?.[0]?.translatedText;
          if (translated) {
            this.translationCache.set(cacheKey, translated);
            return translated;
          }
        }
      }

      // Free Google Translate GTX API endpoint
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(gtxUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.[0])) {
          const translated = data[0].map((item: any) => item[0]).join('');
          this.translationCache.set(cacheKey, translated);
          return translated;
        }
      }
    } catch (err) {
      console.warn('Google Translation failed, returning original text:', err);
    }

    return trimmed;
  }

  async translateBatchWithGoogle(texts: string[], sl = 'en', tl = 'ar'): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    const promises = texts.map(async (txt) => {
      if (!txt) return;
      results[txt] = await this.translateWithGoogle(txt, sl, tl);
    });
    await Promise.all(promises);
    return results;
  }

  // ─── Cache Management ───────────────────────────────────────────────────────

  async clearAllCaches() {
    const memoryKeysPurged = this.translationCache.size;
    this.translationCache.clear();

    return {
      memoryKeysPurged,
      timestamp: new Date().toISOString(),
    };
  }
}

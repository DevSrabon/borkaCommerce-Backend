import { Injectable } from '@nestjs/common';
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
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Default fallback values matching .env lines 4-23 & delivery configuration
  private readonly defaultSettings: Record<string, string> = {
    REDIS_URL: process.env.REDIS_URL || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'admin@example.com,srabon@example.com',

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
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@sabaalwadi.ae',

    // Dynamic Delivery & Shipping Configuration
    shipping_base_fee: '30',
    free_shipping_threshold: '500',
    shipping_discount_min_order: '600',
    shipping_discount_type: 'PERCENTAGE', // 'PERCENTAGE' or 'FIXED'
    shipping_discount_value: '30', // 30% off (or 30 AED off)

    // Stock Configuration
    low_stock_threshold: '5',

    // Size Chart Configuration
    size_chart_guide_text: 'Abaya lengths are standard shoulder-to-hem measurements in inches. Choose your regular size based on height for a graceful floor-length drape.',
    size_chart_image: '',
    size_chart_table: JSON.stringify([
      { size: '50', height: "5'0\" - 5'1\"", length: '50 in', bust: '40 in', sleeve: '26 in' },
      { size: '52', height: "5'2\" - 5'3\"", length: '52 in', bust: '42 in', sleeve: '27 in' },
      { size: '54', height: "5'4\" - 5'5\"", length: '54 in', bust: '44 in', sleeve: '28 in' },
      { size: '56', height: "5'6\" - 5'7\"", length: '56 in', bust: '46 in', sleeve: '29 in' },
      { size: '58', height: "5'8\" - 5'9\"", length: '58 in', bust: '48 in', sleeve: '30 in' },
      { size: '60', height: "5'10\"+", length: '60 in', bust: '50 in', sleeve: '31 in' },
    ]),
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

  async getAllBanners() {
    return this.prisma.banners.findMany({ orderBy: { sort_order: 'asc' } });
  }

  async createBanner(dto: {
    title: string;
    subtitle?: string;
    cta_text?: string;
    cta_link?: string;
    image_url: string;
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

  // ─── Site Settings ───────────────────────────────────────────────────────

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
    const ops = Object.entries(settings).map(([key, value]) =>
      this.prisma.site_settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );
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

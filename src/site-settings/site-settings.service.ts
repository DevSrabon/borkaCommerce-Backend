import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Banners ──────────────────────────────────────────────────────────────

  async getActiveBanners() {
    return this.prisma.banners.findMany({
      where: { is_active: true },
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
    is_active?: boolean;
    sort_order?: number;
  }) {
    return this.prisma.banners.create({ data: dto });
  }

  async updateBanner(id: string, dto: Partial<{
    title: string;
    subtitle: string;
    cta_text: string;
    cta_link: string;
    image_url: string;
    alt_text: string;
    is_active: boolean;
    sort_order: number;
  }>) {
    return this.prisma.banners.update({ where: { id }, data: dto });
  }

  async deleteBanner(id: string) {
    return this.prisma.banners.delete({ where: { id } });
  }

  // ─── Site Settings ────────────────────────────────────────────────────────

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.site_settings.findMany();
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, string>);
  }

  async upsertSettings(settings: Record<string, string>) {
    const ops = Object.entries(settings).map(([key, value]) =>
      this.prisma.site_settings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    );
    await Promise.all(ops);
    return this.getAllSettings();
  }
}

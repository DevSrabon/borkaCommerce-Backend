import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface NavbarItemRecord {
  id: string;
  name: string;
  type: 'ALL_CATEGORIES' | 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCTS' | 'OFFER' | 'CUSTOM';
  category_id?: string | null;
  subcategory_id?: string | null;
  link?: string | null;
  description?: string | null;
  badge?: string | null;
  icon?: string | null;
  sort_order: number;
  is_active: boolean;
  custom_data?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface NavbarCategoryGroup {
  id: string;
  name: string;
  slug: string;
  link: string;
  image?: string;
  description?: string;
  subcategories: {
    id: string;
    name: string;
    slug: string;
    link: string;
    image?: string;
    description?: string;
  }[];
}

export interface PopulatedNavbarTab {
  id: string;
  name: string;
  type: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  slug?: string;
  link: string;
  description?: string;
  badge?: string;
  icon?: string;
  sort_order: number;
  items: {
    id: string;
    name: string;
    link: string;
    image?: string;
    subtitle?: string;
  }[];
  category_groups?: NavbarCategoryGroup[];
}

@Injectable()
export class NavbarService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── ADMIN: List all items ────────────────────────────────────────────────
  async findAll(): Promise<NavbarItemRecord[]> {
    const items = await this.prisma.$queryRawUnsafe<NavbarItemRecord[]>(
      `SELECT * FROM navbar_items ORDER BY sort_order ASC, created_at ASC`
    );
    return items;
  }

  // ─── STOREFRONT: Get active items with rich populated dropdown data ───────
  async getStorefrontNavbar(): Promise<PopulatedNavbarTab[]> {
    const rawItems = await this.prisma.$queryRawUnsafe<NavbarItemRecord[]>(
      `SELECT * FROM navbar_items WHERE is_active = true ORDER BY sort_order ASC, created_at ASC`
    );

    if (!rawItems || rawItems.length === 0) {
      return [];
    }

    // Pre-fetch all categories with children for efficient lookups
    const allCategories = await this.prisma.categories.findMany({
      include: { children: true },
      orderBy: { sort_order: 'asc' },
    });
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

    // Pre-fetch sample products for product/subcategory lookups
    const sampleProducts = await this.prisma.products.findMany({
      where: { status: 'PUBLISHED', deleted_at: null },
      take: 24,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        images: {
          select: { image_url: true },
          take: 1,
        },
        variants: {
          select: { price: true },
          take: 1,
        },
        product_categories: {
          select: { category_id: true },
        },
      },
    });

    const populatedTabs: PopulatedNavbarTab[] = [];

    for (const item of rawItems) {
      let resolvedLink = item.link || '/catalog';
      let resolvedSlug = '';
      let resolvedDesc = item.description || '';
      let dropdownItems: PopulatedNavbarTab['items'] = [];
      let categoryGroups: NavbarCategoryGroup[] | undefined = undefined;

      switch (item.type) {
        case 'ALL_CATEGORIES': {
          resolvedLink = item.link || '/catalog';
          resolvedDesc =
            item.description || 'Explore our complete Emirati couture and daily abaya collection';

          const rootCats = allCategories.filter((c) => !c.parent_id);

          // Build organized hierarchical groups: Parent Category + its distinct Subcategories
          categoryGroups = rootCats.map((root) => ({
            id: root.id,
            name: root.name,
            slug: root.slug,
            link: `/catalog?category=${root.slug}`,
            image: root.image ?? undefined,
            description: root.description ?? undefined,
            subcategories: (root.children || []).map((sub) => ({
              id: sub.id,
              name: sub.name,
              slug: sub.slug,
              link: `/catalog?category=${sub.slug}`,
              image: sub.image ?? undefined,
              description: sub.description ?? undefined,
            })),
          }));

          // Also populate flat items with parent tag in subtitle for fallback
          const allSubs: any[] = [];
          rootCats.forEach((root) => {
            if (root.children && root.children.length > 0) {
              root.children.forEach((sub) => {
                allSubs.push({
                  ...sub,
                  parentName: root.name,
                });
              });
            } else {
              allSubs.push({
                ...root,
                parentName: 'Collection',
              });
            }
          });
          const sourceList = allSubs.length > 0 ? allSubs : rootCats;
          dropdownItems = sourceList.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            link: `/catalog?category=${cat.slug}`,
            image: cat.image || (rootCats[0]?.image ?? undefined),
            subtitle: cat.parentName ? `Under ${cat.parentName}` : (cat.description || 'Explore collection'),
          }));
          break;
        }

        case 'CATEGORY': {
          const cat = item.category_id ? categoryMap.get(item.category_id) : null;
          if (cat) {
            resolvedSlug = cat.slug;
            resolvedLink = item.link || `/catalog?category=${cat.slug}`;
            resolvedDesc = item.description || cat.description || `Explore ${cat.name} collection`;

            if (cat.children && cat.children.length > 0) {
              // Subcategories under this category
              dropdownItems = cat.children.map((sub) => ({
                id: sub.id,
                name: sub.name,
                link: `/catalog?category=${sub.slug}`,
                image: sub.image || cat.image || undefined,
                subtitle: sub.description || 'Explore Collection',
              }));
            } else {
              // Direct products under this category
              const catProds = sampleProducts.filter((p) =>
                p.product_categories?.some((pc) => pc.category_id === cat.id)
              );
              const displayProds = catProds.length > 0 ? catProds : sampleProducts.slice(0, 8);
              dropdownItems = displayProds.map((prod) => ({
                id: prod.id,
                name: prod.name,
                link: `/product/${prod.slug}`,
                image: (prod.images && prod.images[0]?.image_url) || cat.image || undefined,
                subtitle: `AED ${prod.variants?.[0]?.price || '350'}`,
              }));
            }
          }
          break;
        }

        case 'SUBCATEGORY': {
          const targetId = item.subcategory_id || item.category_id;
          const sub = targetId ? categoryMap.get(targetId) : null;
          if (sub) {
            resolvedSlug = sub.slug;
            resolvedLink = item.link || `/catalog?category=${sub.slug}`;
            resolvedDesc = item.description || sub.description || `Explore ${sub.name} collection`;

            const subProds = sampleProducts.filter((p) =>
              p.product_categories?.some((pc) => pc.category_id === sub.id)
            );
            const displayProds = subProds.length > 0 ? subProds : sampleProducts.slice(0, 8);
            dropdownItems = displayProds.map((prod) => ({
              id: prod.id,
              name: prod.name,
              link: `/product/${prod.slug}`,
              image: (prod.images && prod.images[0]?.image_url) || sub.image || undefined,
              subtitle: `AED ${prod.variants?.[0]?.price || '350'}`,
            }));
          }
          break;
        }

        case 'OFFER': {
          resolvedLink = item.link || '/offers';
          resolvedDesc =
            item.description || 'Exclusive Limited-Time Discounts & Seasonal Offers';
          dropdownItems = sampleProducts.slice(0, 8).map((prod) => ({
            id: prod.id,
            name: prod.name,
            link: `/product/${prod.slug}`,
            image: (prod.images && prod.images[0]?.image_url) || undefined,
            subtitle: `Special Deal: AED ${prod.variants?.[0]?.price || '299'}`,
          }));
          break;
        }

        case 'PRODUCTS': {
          resolvedLink = item.link || '/catalog';
          resolvedDesc = item.description || 'Handcrafted & Recommended Bestsellers';
          dropdownItems = sampleProducts.slice(0, 8).map((prod) => ({
            id: prod.id,
            name: prod.name,
            link: `/product/${prod.slug}`,
            image: (prod.images && prod.images[0]?.image_url) || undefined,
            subtitle: `AED ${prod.variants?.[0]?.price || '350'}`,
          }));
          break;
        }

        case 'CUSTOM':
        default: {
          resolvedLink = item.link || '/';
          resolvedDesc = item.description || '';
          if (item.custom_data?.items && Array.isArray(item.custom_data.items)) {
            dropdownItems = item.custom_data.items;
          }
          break;
        }
      }

      populatedTabs.push({
        id: item.id,
        name: item.name,
        type: item.type,
        category_id: item.category_id,
        subcategory_id: item.subcategory_id,
        slug: resolvedSlug,
        link: resolvedLink,
        description: resolvedDesc,
        badge: item.badge || undefined,
        icon: item.icon || undefined,
        sort_order: item.sort_order,
        items: dropdownItems,
        category_groups: categoryGroups,
      });
    }

    return populatedTabs;
  }

  // ─── ADMIN: Create item ───────────────────────────────────────────────────
  async create(dto: {
    name: string;
    type: 'ALL_CATEGORIES' | 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCTS' | 'OFFER' | 'CUSTOM';
    category_id?: string;
    subcategory_id?: string;
    link?: string;
    description?: string;
    badge?: string;
    icon?: string;
    sort_order?: number;
    is_active?: boolean;
    custom_data?: any;
  }): Promise<NavbarItemRecord> {
    const id = 'nav_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const sortOrder = typeof dto.sort_order === 'number' ? dto.sort_order : 99;
    const isActive = dto.is_active !== false;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO navbar_items (id, name, type, category_id, subcategory_id, link, description, badge, icon, sort_order, is_active, custom_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      id,
      dto.name,
      dto.type,
      dto.category_id || null,
      dto.subcategory_id || null,
      dto.link || null,
      dto.description || null,
      dto.badge || null,
      dto.icon || null,
      sortOrder,
      isActive,
      dto.custom_data ? JSON.stringify(dto.custom_data) : null
    );

    const [item] = await this.prisma.$queryRawUnsafe<NavbarItemRecord[]>(
      `SELECT * FROM navbar_items WHERE id = $1`,
      id
    );
    return item;
  }

  // ─── ADMIN: Update item ───────────────────────────────────────────────────
  async update(id: string, dto: Partial<NavbarItemRecord>): Promise<NavbarItemRecord> {
    const existing = await this.prisma.$queryRawUnsafe<NavbarItemRecord[]>(
      `SELECT * FROM navbar_items WHERE id = $1`,
      id
    );
    if (!existing || existing.length === 0) {
      throw new NotFoundException(`Navbar item ${id} not found`);
    }

    const current = existing[0];
    const name = dto.name !== undefined ? dto.name : current.name;
    const type = dto.type !== undefined ? dto.type : current.type;
    const category_id = dto.category_id !== undefined ? dto.category_id : current.category_id;
    const subcategory_id =
      dto.subcategory_id !== undefined ? dto.subcategory_id : current.subcategory_id;
    const link = dto.link !== undefined ? dto.link : current.link;
    const description = dto.description !== undefined ? dto.description : current.description;
    const badge = dto.badge !== undefined ? dto.badge : current.badge;
    const icon = dto.icon !== undefined ? dto.icon : current.icon;
    const sort_order = dto.sort_order !== undefined ? dto.sort_order : current.sort_order;
    const is_active = dto.is_active !== undefined ? dto.is_active : current.is_active;
    const custom_data = dto.custom_data !== undefined ? dto.custom_data : current.custom_data;

    await this.prisma.$executeRawUnsafe(
      `UPDATE navbar_items
       SET name = $1, type = $2, category_id = $3, subcategory_id = $4, link = $5, description = $6, badge = $7, icon = $8, sort_order = $9, is_active = $10, custom_data = $11, updated_at = NOW()
       WHERE id = $12`,
      name,
      type,
      category_id || null,
      subcategory_id || null,
      link || null,
      description || null,
      badge || null,
      icon || null,
      sort_order,
      is_active,
      custom_data ? JSON.stringify(custom_data) : null,
      id
    );

    const [updated] = await this.prisma.$queryRawUnsafe<NavbarItemRecord[]>(
      `SELECT * FROM navbar_items WHERE id = $1`,
      id
    );
    return updated;
  }

  // ─── ADMIN: Delete item ───────────────────────────────────────────────────
  async delete(id: string): Promise<{ success: boolean; id: string }> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM navbar_items WHERE id = $1`, id);
    return { success: true, id };
  }

  // ─── ADMIN: Reorder items ─────────────────────────────────────────────────
  async reorder(items: { id: string; sort_order: number }[]): Promise<{ success: boolean }> {
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE navbar_items SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        item.sort_order,
        item.id
      );
    }
    return { success: true };
  }

  // ─── ADMIN: Reset to Recommended Defaults ─────────────────────────────────
  async seedDefaults(): Promise<{ success: boolean; count: number }> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM navbar_items`);

    const categories = await this.prisma.categories.findMany({
      where: { parent_id: null },
      include: { children: true },
      orderBy: { sort_order: 'asc' },
    });

    const defaultItems: any[] = [
      {
        id: 'nav-shop-all',
        name: 'Shop All',
        type: 'ALL_CATEGORIES',
        link: '/catalog',
        description: 'Explore our complete Emirati couture and daily abaya collection',
        badge: null,
        icon: 'Grid',
        sort_order: 1,
        is_active: true,
      },
    ];

    let order = 2;
    for (const cat of categories) {
      defaultItems.push({
        id: `nav-cat-${cat.id}`,
        name: cat.name,
        type: 'CATEGORY',
        category_id: cat.id,
        link: `/catalog?category=${cat.slug}`,
        description: cat.description || `Explore ${cat.name} collection`,
        badge: null,
        icon: null,
        sort_order: order++,
        is_active: true,
      });

      if (cat.children && cat.children.length > 0) {
        for (const sub of cat.children.slice(0, 4)) {
          defaultItems.push({
            id: `nav-sub-${sub.id}`,
            name: sub.name,
            type: 'SUBCATEGORY',
            category_id: cat.id,
            subcategory_id: sub.id,
            link: `/catalog?category=${sub.slug}`,
            description: sub.description || `${sub.name} collection`,
            badge: null,
            icon: null,
            sort_order: order++,
            is_active: true,
          });
        }
      }
    }

    defaultItems.push({
      id: 'nav-offers',
      name: 'Offers',
      type: 'OFFER',
      link: '/offers',
      description: 'Exclusive Limited-Time Discounts & Seasonal Offers',
      badge: '20% OFF',
      icon: 'Flame',
      sort_order: order++,
      is_active: true,
    });

    for (const item of defaultItems) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO navbar_items (id, name, type, category_id, subcategory_id, link, description, badge, icon, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        item.id,
        item.name,
        item.type,
        item.category_id || null,
        item.subcategory_id || null,
        item.link || null,
        item.description || null,
        item.badge || null,
        item.icon || null,
        item.sort_order,
        item.is_active
      );
    }

    return { success: true, count: defaultItems.length };
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { product_status } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async reorder(items: { id: string; sort_order: number }[]) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Items array is required');
    }
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.categories.update({
          where: { id: item.id },
          data: { sort_order: Number(item.sort_order) || 0 },
        }),
      ),
    );
    return { success: true, count: items.length };
  }

  async create(createCategoryDto: CreateCategoryDto) {
    // Check slug uniqueness
    const existing = await this.prisma.categories.findUnique({
      where: { slug: createCategoryDto.slug },
    });
    if (existing) {
      throw new BadRequestException('Category slug already exists');
    }

    // Verify parent exists if provided
    if (createCategoryDto.parent_id) {
      const parent = await this.prisma.categories.findUnique({
        where: { id: createCategoryDto.parent_id },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      if (parent.parent_id) {
        throw new BadRequestException('Nested subcategories beyond 1 level are not allowed. Only root categories can be parents.');
      }
    }

    return this.prisma.categories.create({
      data: createCategoryDto,
    });
  }

  async findAll(limit = 50, skip = 0) {
    const take = Number(limit) > 0 ? Number(limit) : 50;
    const skipCount = Number(skip) >= 0 ? Number(skip) : 0;

    const [items, total] = await Promise.all([
      this.prisma.categories.findMany({
        take,
        skip: skipCount,
        orderBy: { sort_order: 'asc' },
      }),
      this.prisma.categories.count(),
    ]);

    return { items, total };
  }

  async getStorefrontTree() {
    // 1. Fetch only active categories, sorted by sort_order ascending
    const allActiveCategories = await this.prisma.categories.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    if (allActiveCategories.length === 0) {
      return [];
    }

    // 2. Fetch published, non-deleted product counts grouped by category
    const counts = await this.prisma.product_categories.groupBy({
      by: ['category_id'],
      where: {
        product: {
          status: product_status.PUBLISHED,
          deleted_at: null,
        },
      },
      _count: {
        product_id: true,
      },
    });

    const countMap = new Map<string, number>();
    counts.forEach((c) => {
      countMap.set(c.category_id, c._count.product_id);
    });

    // 3. Map categories into tree structure
    const categoryMap = new Map<string, any>();
    allActiveCategories.forEach((cat) => {
      const directCount = countMap.get(cat.id) || 0;
      categoryMap.set(cat.id, {
        ...cat,
        direct_product_count: directCount,
        product_count: directCount,
        children: [],
      });
    });

    const rawTree: any[] = [];
    allActiveCategories.forEach((cat) => {
      const mapped = categoryMap.get(cat.id);
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(mapped);
        } else {
          rawTree.push(mapped);
        }
      } else {
        rawTree.push(mapped);
      }
    });

    // 4. Build tree with product counts for all active categories
    const buildTree = (nodes: any[]): any[] => {
      const result: any[] = [];
      for (const node of nodes) {
        const validChildren = buildTree(node.children || []);
        const childrenCount = validChildren.reduce((sum, ch) => sum + (ch.product_count || 0), 0);
        const totalCount = (node.direct_product_count || 0) + childrenCount;

        result.push({
          ...node,
          product_count: totalCount,
          children: validChildren,
        });
      }
      return result;
    };

    return buildTree(rawTree);
  }

  async findAllActive() {
    const tree = await this.getStorefrontTree();
    const flatten = (nodes: any[]): any[] => {
      const list: any[] = [];
      for (const node of nodes) {
        const { children, ...rest } = node;
        list.push(rest);
        if (children && children.length > 0) {
          list.push(...flatten(children));
        }
      }
      return list;
    };
    return flatten(tree);
  }

  async getTree() {
    const allCategories = await this.prisma.categories.findMany({
      orderBy: { sort_order: 'asc' },
    });

    const categoryMap = new Map<string, any>();
    const tree: any[] = [];

    // Initialize map
    allCategories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Populate children recursively
    allCategories.forEach((cat) => {
      const mapped = categoryMap.get(cat.id);
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(mapped);
        } else {
          tree.push(mapped);
        }
      } else {
        tree.push(mapped);
      }
    });

    return tree;
  }

  async findOne(id: string) {
    const category = await this.prisma.categories.findUnique({
      where: { id },
      include: { children: true, parent: true },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id); // ensure exists

    if (updateCategoryDto.slug) {
      const existing = await this.prisma.categories.findFirst({
        where: { slug: updateCategoryDto.slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException('Category slug already exists');
      }
    }

    if (updateCategoryDto.parent_id) {
      if (updateCategoryDto.parent_id === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      const parent = await this.prisma.categories.findUnique({
        where: { id: updateCategoryDto.parent_id },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      if (parent.parent_id) {
        throw new BadRequestException('Nested subcategories beyond 1 level are not allowed. Only root categories can be parents.');
      }
      const children = await this.prisma.categories.findMany({
        where: { parent_id: id },
      });
      if (children.length > 0) {
        throw new BadRequestException('This category already has subcategories and cannot become a subcategory.');
      }
      const descendantIds = await this.getDescendantIds(id);
      if (descendantIds.includes(updateCategoryDto.parent_id)) {
        throw new BadRequestException('Category cannot be moved under one of its descendants');
      }
    }

    return this.prisma.categories.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  private async getDescendantIds(id: string): Promise<string[]> {
    const children = await this.prisma.categories.findMany({
      where: { parent_id: id },
      select: { id: true },
    });
    const nested = await Promise.all(children.map((child) => this.getDescendantIds(child.id)));
    return [...children.map((child) => child.id), ...nested.flat()];
  }

  async remove(id: string) {
    await this.findOne(id); // ensure exists
    
    // Disassociate child categories
    await this.prisma.categories.updateMany({
      where: { parent_id: id },
      data: { parent_id: null },
    });

    return this.prisma.categories.delete({
      where: { id },
    });
  }
}

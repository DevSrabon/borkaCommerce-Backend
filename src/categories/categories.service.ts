import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

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

  async findAllActive() {
    return this.prisma.categories.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    });
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
      const descendantIds = await this.getDescendantIds(id);
      if (descendantIds.includes(updateCategoryDto.parent_id)) {
        throw new BadRequestException('Category cannot be moved under one of its descendants');
      }
      const parent = await this.prisma.categories.findUnique({
        where: { id: updateCategoryDto.parent_id },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { basename, join, normalize, relative, extname } from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { UploadFolder, uploadFolders } from './image-upload.middleware';
import { PrismaService } from '../database/prisma.service';
import { SiteSettingsService } from '../site-settings/site-settings.service';

@Injectable()
export class UploadFilesService {
  private readonly logger = new Logger(UploadFilesService.name);
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteSettingsService: SiteSettingsService,
  ) {}

  relativePath(folder: UploadFolder | string, filename: string) {
    return `/${folder}/${filename}`;
  }

  imageUrl(relativePath: string, fallbackBase?: string) {
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    const base =
      process.env.UPLOAD_PUBLIC_BASE_URL ||
      process.env.BACKEND_URL ||
      process.env.API_BASE_URL ||
      process.env.APP_URL ||
      fallbackBase;
    if (!base || base.includes('localhost:8080') || base.includes('127.0.0.1:8080')) {
      // In production or when dynamic host is unavailable, return relative path so the frontend resolves it correctly
      return `/uploads${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
    }
    return `${base.replace(/\/+$/, '')}/uploads${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
  }

  async remove(relativePath: string, expectedFolder: UploadFolder) {
    // If it's a remote cloud URL, we ignore or delete
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return;
    }
    const normalized = normalize(relativePath).replace(/\\/g, '/');
    const expectedPrefix = `/${expectedFolder}/`;
    if (!normalized.startsWith(expectedPrefix) || basename(normalized) !== normalized.split('/').pop()) {
      throw new BadRequestException('Invalid image path');
    }

    const target = join(this.uploadsRoot, normalized);
    if (relative(this.uploadsRoot, target).startsWith('..')) {
      throw new BadRequestException('Invalid image path');
    }

    try {
      await fs.unlink(target);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  isSupportedFolder(folder: string): folder is UploadFolder {
    return uploadFolders.includes(folder as UploadFolder);
  }

  /**
   * Process a saved file: uploads to Cloudflare R2, AWS S3, Cloudinary, or retains in local storage.
   */
  async processUploadedFile(folder: string, filename: string, localFilePath: string, fallbackBase?: string) {
    const driver =
      (await this.siteSettingsService.getSetting('STORAGE_DRIVER')) ||
      (await this.siteSettingsService.getSetting('asset_storage_driver', 'local'));

    // 1. CLOUDFLARE R2 (S3-compatible)
    if (driver === 'r2') {
      const accountId = await this.siteSettingsService.getSetting('R2_ACCOUNT_ID');
      const accessKeyId = await this.siteSettingsService.getSetting('R2_ACCESS_KEY_ID');
      const secretAccessKey = await this.siteSettingsService.getSetting('R2_SECRET_ACCESS_KEY');
      const bucketName = await this.siteSettingsService.getSetting('R2_BUCKET_NAME');
      const publicDomain = await this.siteSettingsService.getSetting('R2_PUBLIC_DOMAIN');

      if (accountId && accessKeyId && secretAccessKey && bucketName) {
        try {
          const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
          });

          const fileBuffer = await fs.readFile(localFilePath);
          const key = `${folder}/${filename}`;
          const ext = extname(filename).toLowerCase();
          const contentType =
            ext === '.png'
              ? 'image/png'
              : ext === '.webp'
              ? 'image/webp'
              : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/jpeg';

          await s3.send(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              Body: fileBuffer,
              ContentType: contentType,
            }),
          );

          try { await fs.unlink(localFilePath); } catch (_) {}

          const domain = publicDomain
            ? publicDomain.replace(/\/+$/, '')
            : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
          const finalUrl = `${domain}/${key}`;

          return {
            imageUrl: finalUrl,
            imagePath: finalUrl,
            storage: 'r2',
          };
        } catch (err: any) {
          this.logger.error(`Cloudflare R2 upload failed: ${err.message}. Falling back to local.`);
        }
      }
    }

    // 2. AWS S3
    if (driver === 's3') {
      const region = (await this.siteSettingsService.getSetting('AWS_S3_REGION')) || 'me-central-1';
      const accessKeyId = await this.siteSettingsService.getSetting('AWS_S3_ACCESS_KEY_ID');
      const secretAccessKey = await this.siteSettingsService.getSetting('AWS_S3_SECRET_ACCESS_KEY');
      const bucketName = await this.siteSettingsService.getSetting('AWS_S3_BUCKET_NAME');
      const publicDomain = await this.siteSettingsService.getSetting('AWS_S3_PUBLIC_DOMAIN');

      if (accessKeyId && secretAccessKey && bucketName) {
        try {
          const s3 = new S3Client({
            region,
            credentials: { accessKeyId, secretAccessKey },
          });

          const fileBuffer = await fs.readFile(localFilePath);
          const key = `${folder}/${filename}`;
          const ext = extname(filename).toLowerCase();
          const contentType =
            ext === '.png'
              ? 'image/png'
              : ext === '.webp'
              ? 'image/webp'
              : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/jpeg';

          await s3.send(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              Body: fileBuffer,
              ContentType: contentType,
            }),
          );

          try { await fs.unlink(localFilePath); } catch (_) {}

          const domain = publicDomain
            ? publicDomain.replace(/\/+$/, '')
            : `https://${bucketName}.s3.${region}.amazonaws.com`;
          const finalUrl = `${domain}/${key}`;

          return {
            imageUrl: finalUrl,
            imagePath: finalUrl,
            storage: 's3',
          };
        } catch (err: any) {
          this.logger.error(`AWS S3 upload failed: ${err.message}. Falling back to local.`);
        }
      }
    }

    // 3. CLOUDINARY
    if (driver === 'cloudinary') {
      const cloudName =
        (await this.siteSettingsService.getSetting('CLOUDINARY_CLOUD_NAME')) ||
        (await this.siteSettingsService.getSetting('cloudinary_cloud_name'));
      const apiKey =
        (await this.siteSettingsService.getSetting('CLOUDINARY_API_KEY')) ||
        (await this.siteSettingsService.getSetting('cloudinary_api_key'));
      const apiSecret =
        (await this.siteSettingsService.getSetting('CLOUDINARY_API_SECRET')) ||
        (await this.siteSettingsService.getSetting('cloudinary_api_secret'));
      const cloudFolder =
        (await this.siteSettingsService.getSetting('CLOUDINARY_FOLDER')) ||
        (await this.siteSettingsService.getSetting('cloudinary_folder', 'borkacommerce'));

      if (cloudName && apiKey && apiSecret) {
        try {
          cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
          });

          const uploadResult = await cloudinary.uploader.upload(localFilePath, {
            folder: `${cloudFolder}/${folder}`,
            use_filename: true,
            unique_filename: true,
            resource_type: 'auto',
          });

          try {
            await fs.unlink(localFilePath);
          } catch (_) {}

          return {
            imageUrl: uploadResult.secure_url,
            imagePath: uploadResult.secure_url,
            storage: 'cloudinary',
          };
        } catch (err: any) {
          this.logger.error(`Cloudinary upload failed: ${err.message}. Falling back to local storage.`);
        }
      }
    }

    // 4. LOCAL DISK STORAGE (Default)
    const relPath = this.relativePath(folder, filename);
    return {
      imageUrl: this.imageUrl(relPath, fallbackBase),
      imagePath: relPath,
      storage: 'local',
    };
  }

  /**
   * Test connection to a storage provider
   */
  async testStorageConnection(driver: string, overrideConfig?: Record<string, string>) {
    if (driver === 'r2') {
      const accountId =
        overrideConfig?.R2_ACCOUNT_ID || (await this.siteSettingsService.getSetting('R2_ACCOUNT_ID'));
      const accessKeyId =
        overrideConfig?.R2_ACCESS_KEY_ID || (await this.siteSettingsService.getSetting('R2_ACCESS_KEY_ID'));
      const secretAccessKey =
        overrideConfig?.R2_SECRET_ACCESS_KEY ||
        (await this.siteSettingsService.getSetting('R2_SECRET_ACCESS_KEY'));
      const bucketName =
        overrideConfig?.R2_BUCKET_NAME || (await this.siteSettingsService.getSetting('R2_BUCKET_NAME'));

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        return {
          success: false,
          message: 'All R2 credentials (Account ID, Access Key, Secret Key, Bucket Name) are required.',
        };
      }

      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        });
        const start = Date.now();
        await s3.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
        const latency = Date.now() - start;
        return { success: true, message: `Cloudflare R2 Bucket verified! Latency: ${latency}ms`, latency };
      } catch (err: any) {
        return { success: false, message: `Cloudflare R2 connection failed: ${err.message}` };
      }
    }

    if (driver === 's3') {
      const region =
        overrideConfig?.AWS_S3_REGION ||
        (await this.siteSettingsService.getSetting('AWS_S3_REGION')) ||
        'me-central-1';
      const accessKeyId =
        overrideConfig?.AWS_S3_ACCESS_KEY_ID ||
        (await this.siteSettingsService.getSetting('AWS_S3_ACCESS_KEY_ID'));
      const secretAccessKey =
        overrideConfig?.AWS_S3_SECRET_ACCESS_KEY ||
        (await this.siteSettingsService.getSetting('AWS_S3_SECRET_ACCESS_KEY'));
      const bucketName =
        overrideConfig?.AWS_S3_BUCKET_NAME ||
        (await this.siteSettingsService.getSetting('AWS_S3_BUCKET_NAME'));

      if (!accessKeyId || !secretAccessKey || !bucketName) {
        return {
          success: false,
          message: 'All AWS S3 credentials (Access Key, Secret Key, Bucket Name) are required.',
        };
      }

      try {
        const s3 = new S3Client({
          region,
          credentials: { accessKeyId, secretAccessKey },
        });
        const start = Date.now();
        await s3.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
        const latency = Date.now() - start;
        return { success: true, message: `AWS S3 Bucket verified (${region})! Latency: ${latency}ms`, latency };
      } catch (err: any) {
        return { success: false, message: `AWS S3 connection failed: ${err.message}` };
      }
    }

    if (driver === 'cloudinary') {
      const cloudName =
        overrideConfig?.CLOUDINARY_CLOUD_NAME ||
        (await this.siteSettingsService.getSetting('CLOUDINARY_CLOUD_NAME'));
      const apiKey =
        overrideConfig?.CLOUDINARY_API_KEY ||
        (await this.siteSettingsService.getSetting('CLOUDINARY_API_KEY'));
      const apiSecret =
        overrideConfig?.CLOUDINARY_API_SECRET ||
        (await this.siteSettingsService.getSetting('CLOUDINARY_API_SECRET'));

      if (!cloudName || !apiKey || !apiSecret) {
        return {
          success: false,
          message: 'Cloudinary Cloud Name, API Key, and API Secret are required.',
        };
      }

      try {
        cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
        const start = Date.now();
        await cloudinary.api.ping();
        const latency = Date.now() - start;
        return { success: true, message: `Cloudinary API verified! Latency: ${latency}ms`, latency };
      } catch (err: any) {
        return { success: false, message: `Cloudinary ping failed: ${err.message}` };
      }
    }

    return { success: true, message: 'Local disk storage is active (/uploads directory).' };
  }

  /**
   * Get storage distribution status
   */
  async getStorageStatus() {
    const driver =
      (await this.siteSettingsService.getSetting('STORAGE_DRIVER')) ||
      (await this.siteSettingsService.getSetting('asset_storage_driver', 'local'));
    const cloudName = await this.siteSettingsService.getSetting('CLOUDINARY_CLOUD_NAME') || await this.siteSettingsService.getSetting('cloudinary_cloud_name');
    const r2Bucket = await this.siteSettingsService.getSetting('R2_BUCKET_NAME');
    const s3Bucket = await this.siteSettingsService.getSetting('AWS_S3_BUCKET_NAME');

    const [productImages, variantImages, banners, categories, blogs] = await Promise.all([
      this.prisma.product_images.findMany({ select: { id: true, image_url: true } }),
      this.prisma.variant_images.findMany({ select: { id: true, image: true } }),
      this.prisma.banners.findMany({ select: { id: true, image_url: true, mobile_image_url: true } }),
      this.prisma.categories.findMany({ select: { id: true, image: true } }),
      this.prisma.blogs.findMany({ select: { id: true, featured_image: true, main_image: true } }),
    ]);

    let localCount = 0;
    let cloudinaryCount = 0;
    let r2Count = 0;
    let s3Count = 0;
    let externalCount = 0;

    const allUrls = [
      ...productImages.map((i) => i.image_url),
      ...variantImages.map((i) => i.image),
      ...banners.map((i) => i.image_url),
      ...banners.map((i) => i.mobile_image_url).filter(Boolean),
      ...categories.map((i) => i.image).filter(Boolean),
      ...blogs.map((i) => i.featured_image).filter(Boolean),
      ...blogs.map((i) => i.main_image).filter(Boolean),
    ] as string[];

    for (const url of allUrls) {
      if (!url) continue;
      if (url.includes('cloudinary.com')) {
        cloudinaryCount++;
      } else if (url.includes('.r2.') || url.includes('r2.cloudflarestorage.com') || url.includes('.r2.dev')) {
        r2Count++;
      } else if (url.includes('.s3.') || url.includes('amazonaws.com')) {
        s3Count++;
      } else if (url.includes('/uploads/') || url.startsWith('/')) {
        localCount++;
      } else {
        externalCount++;
      }
    }

    return {
      activeDriver: driver,
      configuredCloudinary: Boolean(cloudName),
      configuredR2: Boolean(r2Bucket),
      configuredS3: Boolean(s3Bucket),
      totalAssets: allUrls.length,
      localAssets: localCount,
      cloudinaryAssets: cloudinaryCount,
      r2Assets: r2Count,
      s3Assets: s3Count,
      externalAssets: externalCount,
    };
  }

  /**
   * Migrate all local assets stored in database to Cloudinary
   */
  async migrateToCloudinary() {
    const cloudName = await this.siteSettingsService.getSetting('cloudinary_cloud_name');
    const apiKey = await this.siteSettingsService.getSetting('cloudinary_api_key');
    const apiSecret = await this.siteSettingsService.getSetting('cloudinary_api_secret');
    const cloudFolder = await this.siteSettingsService.getSetting('cloudinary_folder', 'saba_al_wadi');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary credentials (cloud name, API key, API secret) must be configured in Site Settings before migrating.');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    let migratedCount = 0;
    const errors: string[] = [];

    const uploadLocalFile = async (urlOrPath: string, subfolder: string): Promise<string | null> => {
      // Extract local relative path
      let rel = urlOrPath;
      if (rel.startsWith('http://') || rel.startsWith('https://')) {
        const match = rel.match(/\/uploads\/(.+)$/);
        if (match) rel = '/' + match[1];
        else return null; // already external or non-local
      }
      if (!rel.startsWith('/')) rel = '/' + rel;

      const fullPath = join(this.uploadsRoot, rel.substring(1));
      if (!fsSync.existsSync(fullPath)) {
        return null;
      }

      try {
        const res = await cloudinary.uploader.upload(fullPath, {
          folder: `${cloudFolder}/${subfolder}`,
          use_filename: true,
          unique_filename: true,
          resource_type: 'auto',
        });
        return res.secure_url;
      } catch (err: any) {
        errors.push(`Failed to upload ${rel}: ${err.message}`);
        return null;
      }
    };

    // 1. Product Images
    const prodImages = await this.prisma.product_images.findMany();
    for (const img of prodImages) {
      if (img.image_url && (img.image_url.includes('/uploads/') || img.image_url.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(img.image_url, 'product');
        if (cloudUrl) {
          await this.prisma.product_images.update({
            where: { id: img.id },
            data: { image_url: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // 2. Variant Images
    const varImages = await this.prisma.variant_images.findMany();
    for (const img of varImages) {
      if (img.image && (img.image.includes('/uploads/') || img.image.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(img.image, 'variant');
        if (cloudUrl) {
          await this.prisma.variant_images.update({
            where: { id: img.id },
            data: { image: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // 3. Banners
    const banners = await this.prisma.banners.findMany();
    for (const banner of banners) {
      if (banner.image_url && (banner.image_url.includes('/uploads/') || banner.image_url.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(banner.image_url, 'banner');
        if (cloudUrl) {
          await this.prisma.banners.update({
            where: { id: banner.id },
            data: { image_url: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // 4. Categories
    const categories = await this.prisma.categories.findMany();
    for (const cat of categories) {
      if (cat.image && (cat.image.includes('/uploads/') || cat.image.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(cat.image, 'category');
        if (cloudUrl) {
          await this.prisma.categories.update({
            where: { id: cat.id },
            data: { image: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // 5. Blogs
    const blogs = await this.prisma.blogs.findMany();
    for (const blog of blogs) {
      if (blog.featured_image && (blog.featured_image.includes('/uploads/') || blog.featured_image.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(blog.featured_image, 'blog');
        if (cloudUrl) {
          await this.prisma.blogs.update({
            where: { id: blog.id },
            data: { featured_image: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // 6. Site Settings (logo, favicon, og, size chart)
    const settings = await this.prisma.site_settings.findMany({
      where: {
        key: { in: ['logo_url', 'favicon_url', 'og_image_url', 'size_chart_file', 'size_chart_image'] },
      },
    });
    for (const s of settings) {
      if (s.value && (s.value.includes('/uploads/') || s.value.startsWith('/'))) {
        const cloudUrl = await uploadLocalFile(s.value, 'settings');
        if (cloudUrl) {
          await this.prisma.site_settings.update({
            where: { key: s.key },
            data: { value: cloudUrl },
          });
          migratedCount++;
        }
      }
    }

    // Set active driver to cloudinary
    await this.siteSettingsService.upsertSettings({ STORAGE_DRIVER: 'cloudinary', asset_storage_driver: 'cloudinary' });

    return {
      success: true,
      migratedCount,
      errors: errors.slice(0, 5),
      message: `Successfully migrated ${migratedCount} assets to Cloudinary. Active driver updated to 'cloudinary'.`,
    };
  }

  /**
   * Migrate Cloudinary assets stored in database to local storage
   */
  async migrateToLocal() {
    let migratedCount = 0;
    const errors: string[] = [];
    const localDir = join(this.uploadsRoot, 'migrated');
    if (!fsSync.existsSync(localDir)) {
      fsSync.mkdirSync(localDir, { recursive: true });
    }

    const downloadToLocal = async (url: string): Promise<string | null> => {
      if (!url || !url.includes('cloudinary.com')) return null;

      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        const urlParts = url.split('/');
        const originalName = urlParts[urlParts.length - 1].split('?')[0];
        const filename = `${Date.now()}-${originalName}`;
        const targetPath = join(localDir, filename);

        await fs.writeFile(targetPath, buffer);
        return `${process.env.UPLOAD_PUBLIC_BASE_URL ?? 'http://localhost:8080'}/uploads/migrated/${filename}`;
      } catch (err: any) {
        errors.push(`Download failed for ${url}: ${err.message}`);
        return null;
      }
    };

    // 1. Product Images
    const prodImages = await this.prisma.product_images.findMany();
    for (const img of prodImages) {
      if (img.image_url?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(img.image_url);
        if (localUrl) {
          await this.prisma.product_images.update({
            where: { id: img.id },
            data: { image_url: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // 2. Variant Images
    const varImages = await this.prisma.variant_images.findMany();
    for (const img of varImages) {
      if (img.image?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(img.image);
        if (localUrl) {
          await this.prisma.variant_images.update({
            where: { id: img.id },
            data: { image: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // 3. Banners
    const banners = await this.prisma.banners.findMany();
    for (const banner of banners) {
      if (banner.image_url?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(banner.image_url);
        if (localUrl) {
          await this.prisma.banners.update({
            where: { id: banner.id },
            data: { image_url: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // 4. Categories
    const categories = await this.prisma.categories.findMany();
    for (const cat of categories) {
      if (cat.image?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(cat.image);
        if (localUrl) {
          await this.prisma.categories.update({
            where: { id: cat.id },
            data: { image: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // 5. Blogs
    const blogs = await this.prisma.blogs.findMany();
    for (const blog of blogs) {
      if (blog.featured_image?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(blog.featured_image);
        if (localUrl) {
          await this.prisma.blogs.update({
            where: { id: blog.id },
            data: { featured_image: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // 6. Site Settings
    const settings = await this.prisma.site_settings.findMany({
      where: {
        key: { in: ['logo_url', 'favicon_url', 'og_image_url', 'size_chart_file', 'size_chart_image'] },
      },
    });
    for (const s of settings) {
      if (s.value?.includes('cloudinary.com')) {
        const localUrl = await downloadToLocal(s.value);
        if (localUrl) {
          await this.prisma.site_settings.update({
            where: { key: s.key },
            data: { value: localUrl },
          });
          migratedCount++;
        }
      }
    }

    // Set active driver to local
    await this.siteSettingsService.upsertSettings({ STORAGE_DRIVER: 'local', asset_storage_driver: 'local' });

    return {
      success: true,
      migratedCount,
      errors: errors.slice(0, 5),
      message: `Successfully migrated ${migratedCount} assets to local internal storage. Active driver updated to 'local'.`,
    };
  }
}

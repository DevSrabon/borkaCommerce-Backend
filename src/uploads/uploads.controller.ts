import { Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { AdminGuard } from '../auth/admin.guard';
import { UploadFilesService } from './upload-files.service';

@Controller('admin/media')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly uploadFilesService: UploadFilesService) {}

  @Get('storage-status')
  async getStorageStatus() {
    return this.uploadFilesService.getStorageStatus();
  }

  @Post('test-storage')
  async testStorage(@Body() body: { driver: string; config?: Record<string, string> }) {
    return this.uploadFilesService.testStorageConnection(body.driver, body.config);
  }

  @Post('migrate-to-cloudinary')
  async migrateToCloudinary() {
    return this.uploadFilesService.migrateToCloudinary();
  }

  @Post('migrate-to-local')
  async migrateToLocal() {
    return this.uploadFilesService.migrateToLocal();
  }

  @Get()
  async getMedia() {
    const uploadsRoot = join(process.cwd(), 'uploads');
    const folders = ['media', 'product', 'customer', 'banner', 'category', 'blog', 'migrated'];
    const mediaList: { url: string; path: string; name: string; folder: string }[] = [];

    for (const folder of folders) {
      const folderPath = join(uploadsRoot, folder);
      if (fs.existsSync(folderPath)) {
        try {
          const files = await fs.promises.readdir(folderPath);
          for (const file of files) {
            const stat = await fs.promises.stat(join(folderPath, file));
            if (stat.isFile()) {
              const relativePath = `/${folder}/${file}`;
              mediaList.push({
                url: this.uploadFilesService.imageUrl(relativePath),
                path: relativePath,
                name: file,
                folder: folder,
              });
            }
          }
        } catch (err) {
          console.error(`Error reading folder ${folder}:`, err);
        }
      }
    }

    return mediaList.reverse(); // Latest uploads first
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const queryFolder = (((req.query.folder as string) || (req.body && req.body.folder)) || 'media').toLowerCase();
          const allowed = ['media', 'product', 'customer', 'banner', 'category', 'blog', 'chat'];
          const folder = allowed.includes(queryFolder) ? queryFolder : 'media';
          const dest = join(process.cwd(), 'uploads', folder);
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          callback(null, dest);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async uploadMedia(
    @UploadedFile() file: any,
    @Query('folder') folderQuery?: string,
    @Body('folder') bodyFolder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const queryFolder = (folderQuery || bodyFolder || 'media').toLowerCase();
    const allowed = ['media', 'product', 'customer', 'banner', 'category', 'blog', 'chat'];
    const folder = allowed.includes(queryFolder) ? queryFolder : 'media';

    const res = await this.uploadFilesService.processUploadedFile(folder, file.filename, file.path);
    return {
      ...res,
      url: res.imageUrl,
    };
  }
}

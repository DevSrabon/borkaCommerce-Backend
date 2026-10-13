import { Controller, Get, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/media')
@UseGuards(AdminGuard)
export class UploadsController {

  @Get()
  async getMedia() {
    const uploadsRoot = join(process.cwd(), 'uploads');
    const folders = ['product', 'customer', 'banner', 'category', 'blog'];
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
                url: `http://localhost:8080/uploads${relativePath}`,
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

    return mediaList.reverse(); // Latest uploads first (as files are named with timestamp prefix)
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const queryFolder = (req.query.folder as string) || 'product';
          const allowed = ['product', 'customer', 'banner', 'category', 'blog'];
          const folder = allowed.includes(queryFolder) ? queryFolder : 'product';
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
  async uploadMedia(@UploadedFile() file: any, @Query('folder') folderQuery?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const queryFolder = folderQuery || 'product';
    const allowed = ['product', 'customer', 'banner', 'category'];
    const folder = allowed.includes(queryFolder) ? queryFolder : 'product';
    const relativePath = `/${folder}/${file.filename}`;
    return {
      imageUrl: `http://localhost:8080/uploads${relativePath}`,
      imagePath: relativePath,
    };
  }
}

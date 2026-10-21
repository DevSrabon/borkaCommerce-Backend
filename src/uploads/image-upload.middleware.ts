import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

export const uploadFolders = [
  'media', 'product', 'customer', 'banner', 'category', 'blog', 'chat',
  'product_files', 'product_category', 'banner_files', 'blog_files', 'website_settings_files', 'ecommerce_files'
] as const;
export type UploadFolder = (typeof uploadFolders)[number];

/**
 * Shared multer storage configuration. Callers choose from the fixed folder
 * list; request input is never used as a filesystem path.
 */
export function imageUploadMiddleware(folder: UploadFolder) {
  if (!uploadFolders.includes(folder)) {
    throw new BadRequestException('Unsupported upload folder');
  }

  return diskStorage({
    destination: (_request, _file, callback) => {
      const destination = join(process.cwd(), 'uploads', folder);
      fs.mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    },
  });
}

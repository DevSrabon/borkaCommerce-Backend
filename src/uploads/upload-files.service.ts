import { BadRequestException, Injectable } from '@nestjs/common';
import { basename, join, normalize, relative } from 'path';
import * as fs from 'fs/promises';
import { UploadFolder, uploadFolders } from './image-upload.middleware';

@Injectable()
export class UploadFilesService {
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  relativePath(folder: UploadFolder, filename: string) {
    return `/${folder}/${filename}`;
  }

  imageUrl(relativePath: string) {
    return `${process.env.UPLOAD_PUBLIC_BASE_URL ?? 'http://localhost:8080'}/uploads${relativePath}`;
  }

  async remove(relativePath: string, expectedFolder: UploadFolder) {
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
}

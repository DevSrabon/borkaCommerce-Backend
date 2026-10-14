import { Module } from '@nestjs/common';
import { UploadFilesService } from './upload-files.service';
import { UploadsController } from './uploads.controller';
import { DatabaseModule } from '../database/database.module';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Module({
  imports: [DatabaseModule, SiteSettingsModule],
  controllers: [UploadsController],
  providers: [UploadFilesService],
  exports: [UploadFilesService],
})
export class UploadsModule {}

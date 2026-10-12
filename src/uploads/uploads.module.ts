import { Module } from '@nestjs/common';
import { UploadFilesService } from './upload-files.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [UploadFilesService],
  exports: [UploadFilesService],
})
export class UploadsModule {}

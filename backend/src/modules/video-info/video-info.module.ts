import { Module } from '@nestjs/common';
import { VideoInfoController } from './controllers/video-info.controller';
import { VideoInfoService } from './services/video-info.service';

@Module({
  controllers: [VideoInfoController],
  providers: [VideoInfoService],
  exports: [VideoInfoService],
})
export class VideoInfoModule {}

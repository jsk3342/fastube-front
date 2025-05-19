import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SubtitlesModule } from './modules/subtitles/subtitles.module';
import { VideoInfoModule } from './modules/video-info/video-info.module';

@Module({
  imports: [SubtitlesModule, VideoInfoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

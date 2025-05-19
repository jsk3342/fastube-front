import { Module } from '@nestjs/common';
import { SubtitlesController } from './controllers/subtitles.controller';
import { SubtitlesService } from './services/subtitles.service';

@Module({
  controllers: [SubtitlesController],
  providers: [SubtitlesService],
  exports: [SubtitlesService],
})
export class SubtitlesModule {}

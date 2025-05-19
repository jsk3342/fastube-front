import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SubtitlesService } from '../services/subtitles.service';
import { SubtitleRequestDto, SubtitleResponseDto } from '../dto/subtitle.dto';

@ApiTags('subtitles')
@Controller('subtitles')
export class SubtitlesController {
  constructor(private readonly subtitlesService: SubtitlesService) {}

  @Post()
  @ApiOperation({ summary: '유튜브 영상의 자막 추출' })
  @ApiResponse({
    status: 200,
    description: '자막 추출 성공',
    type: SubtitleResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  @ApiResponse({ status: 404, description: '자막을 찾을 수 없음' })
  async extractSubtitles(
    @Body() subtitleRequestDto: SubtitleRequestDto,
  ): Promise<SubtitleResponseDto> {
    return this.subtitlesService.extractSubtitles(subtitleRequestDto);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VideoInfoService } from '../services/video-info.service';
import { VideoInfoResponseDto } from '../dto/video-info.dto';

@ApiTags('video-info')
@Controller('video/info')
export class VideoInfoController {
  constructor(private readonly videoInfoService: VideoInfoService) {}

  @Get()
  @ApiOperation({ summary: '유튜브 영상 정보 조회' })
  @ApiQuery({
    name: 'id',
    description: '유튜브 비디오 ID',
    type: String,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: '비디오 정보 조회 성공',
    type: VideoInfoResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  @ApiResponse({ status: 404, description: '비디오를 찾을 수 없음' })
  async getVideoInfo(
    @Query('id') videoId: string,
  ): Promise<VideoInfoResponseDto> {
    return this.videoInfoService.getVideoInfo(videoId);
  }
}

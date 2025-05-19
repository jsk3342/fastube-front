import { Injectable, NotFoundException } from '@nestjs/common';
import { VideoInfoResponseDto, VideoInfoDataDto } from '../dto/video-info.dto';

@Injectable()
export class VideoInfoService {
  async getVideoInfo(videoId: string): Promise<VideoInfoResponseDto> {
    try {
      // 실제로는 YouTube API 호출 코드가 여기에 들어갑니다.
      // 현재는 목업 데이터를 반환합니다.

      if (!videoId) {
        throw new NotFoundException('비디오 ID가 제공되지 않았습니다.');
      }

      // VideoInfoDataDto 형식으로 변환
      const data: VideoInfoDataDto = {
        title: `비디오 ${videoId}의 제목`,
        channelName: '샘플 채널명',
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 360, // 6분 (초 단위)
        availableLanguages: ['ko', 'en', 'ja', 'zh-CN'],
      };

      return {
        success: true,
        data,
      };
    } catch (error) {
      // 에러 처리 로직
      throw error;
    }
  }
}

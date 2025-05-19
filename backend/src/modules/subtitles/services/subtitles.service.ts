import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { getSubtitles } from 'youtube-captions-scraper';
import { DOMParser } from 'xmldom';
import {
  SubtitleRequestDto,
  SubtitleResponseDto,
  SubtitleDataDto,
  CaptionDto,
} from '../dto/subtitle.dto';

interface YouTubeSubtitleTrack {
  baseUrl: string;
  name: { simpleText: string };
  languageCode: string;
  kind?: string;
  isTranslatable?: boolean;
}

interface YouTubeOEmbedResponse {
  title: string;
  author_name: string;
  [key: string]: any;
}

interface YouTubePlayerConfig {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YouTubeSubtitleTrack[];
    };
  };
}

@Injectable()
export class SubtitlesService {
  private readonly logger = new Logger(SubtitlesService.name);

  async extractSubtitles(
    subtitleRequestDto: SubtitleRequestDto,
  ): Promise<SubtitleResponseDto> {
    try {
      // YouTube URL에서 ID 추출
      const videoId = this.extractVideoId(subtitleRequestDto.url);
      if (!videoId) {
        throw new NotFoundException('유효한 YouTube URL이 아닙니다.');
      }

      // 비디오 정보 가져오기
      const videoInfo = await this.getVideoInfo(videoId);

      // 자막 가져오기 (요청한 언어로 시도)
      let captions: CaptionDto[];
      const requestedLanguage = subtitleRequestDto.language || 'ko';

      try {
        captions = await this.getYouTubeSubtitles(videoId, requestedLanguage);
      } catch (error) {
        // 요청한 언어가 실패했을 경우 영어 자막 시도
        if (requestedLanguage !== 'en') {
          this.logger.log(
            `${requestedLanguage} 자막을 찾을 수 없어 영어 자막으로 시도합니다.`,
          );
          try {
            captions = await this.getYouTubeSubtitles(videoId, 'en');
          } catch (error: unknown) {
            // 영어 자막도 없는 경우
            throw new NotFoundException(
              '자막을 찾을 수 없습니다. 영어 자막도 제공되지 않습니다.',
            );
          }
        } else {
          // 요청한 언어가 이미 영어인 경우
          throw error;
        }
      }

      // 전체 자막 텍스트 조합
      const fullText = captions.map((caption) => caption.text).join(' ');

      // SubtitleDataDto 형식으로 변환
      const data: SubtitleDataDto = {
        text: fullText,
        subtitles: captions,
        videoInfo: {
          title: videoInfo.title,
          channelName: videoInfo.channelName,
          thumbnailUrl: videoInfo.thumbnailUrl,
        },
      };

      return {
        success: true,
        data,
      };
    } catch (error) {
      // 에러 처리 로직
      const errorMessage =
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.';
      this.logger.error('자막 추출 오류:', errorMessage);

      throw new HttpException(
        {
          success: false,
          message: errorMessage || '자막 추출 중 오류가 발생했습니다.',
        },
        error instanceof NotFoundException
          ? HttpStatus.NOT_FOUND
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * YouTube URL에서 동영상 ID를 추출합니다.
   */
  private extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // youtube.com/watch?v=VIDEO_ID 형식
      if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v');
      }

      // youtu.be/VIDEO_ID 형식
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.substring(1);
      }

      return null;
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * YouTube 자막을 가져오는 함수
   */
  private async getYouTubeSubtitles(
    videoId: string,
    language = 'ko',
  ): Promise<CaptionDto[]> {
    try {
      // youtube-captions-scraper 라이브러리를 사용하여 자막 가져오기
      const captions = await getSubtitles({
        videoID: videoId,
        lang: language,
      });

      return captions.map((caption) => ({
        start: caption.start,
        dur: caption.dur,
        text: caption.text,
      }));
    } catch (error) {
      this.logger.error(
        '자막 가져오기 실패:',
        error instanceof Error ? error.message : '알 수 없는 오류',
      );

      // 자막을 가져오는 다른 방법 시도 (웹 스크래핑)
      try {
        const tracks = await this.getSubtitleTracks(videoId);

        // 요청된 언어 코드와 일치하는 자막 트랙 찾기
        const track = tracks.find((track) => track.languageCode === language);

        if (track) {
          const subtitles = await this.getSubtitlesFromUrl(track.baseUrl);
          return subtitles;
        }

        throw new NotFoundException(
          `${language} 언어의 자막을 찾을 수 없습니다.`,
        );
      } catch (scrapingError) {
        const errorMessage =
          scrapingError instanceof Error
            ? scrapingError.message
            : '알 수 없는 오류';

        throw new NotFoundException(
          '자막을 가져올 수 없습니다: ' + errorMessage,
        );
      }
    }
  }

  /**
   * YouTube 비디오 정보를 가져오는 함수
   */
  private async getVideoInfo(videoId: string): Promise<{
    title: string;
    channelName: string;
    thumbnailUrl: string;
  }> {
    try {
      // YouTube oEmbed API를 사용하여 기본 정보 가져오기
      const response = await axios.get<YouTubeOEmbedResponse>(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );

      return {
        title: response.data.title,
        channelName: response.data.author_name,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      };
    } catch (error) {
      this.logger.error(
        '비디오 정보 가져오기 실패:',
        error instanceof Error ? error.message : '알 수 없는 오류',
      );

      // 기본 정보 반환
      return {
        title: `비디오 ${videoId}`,
        channelName: '알 수 없음',
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      };
    }
  }

  /**
   * YouTube 비디오에서 사용 가능한 자막 트랙 목록 가져오기
   */
  private async getSubtitleTracks(
    videoId: string,
  ): Promise<YouTubeSubtitleTrack[]> {
    try {
      // 비디오 페이지 가져오기
      const response = await axios.get(
        `https://www.youtube.com/watch?v=${videoId}`,
      );
      const html = response.data as string;

      // 자막 정보 추출
      const playerConfigMatch = html.match(
        /ytInitialPlayerResponse\s*=\s*({.*?});/s,
      );
      if (!playerConfigMatch || !playerConfigMatch[1]) {
        throw new Error('비디오 정보를 가져올 수 없습니다.');
      }

      const playerConfig = JSON.parse(
        playerConfigMatch[1],
      ) as YouTubePlayerConfig;
      const captionTracks =
        playerConfig?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks || [];

      return captionTracks;
    } catch (error) {
      this.logger.error(
        '자막 트랙 가져오기 실패:',
        error instanceof Error ? error.message : '알 수 없는 오류',
      );
      throw new Error('자막 목록을 가져올 수 없습니다.');
    }
  }

  /**
   * XML 자막 가져오기 및 파싱
   */
  private async getSubtitlesFromUrl(url: string): Promise<CaptionDto[]> {
    try {
      // XML 형식 자막 가져오기
      const response = await axios.get(url);
      const xml = response.data as string;

      // DOM 파서 생성
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');
      const textElements = xmlDoc.getElementsByTagName('text');

      // CaptionDto 형식으로 변환 - NodeList를 Array로 변환하여 map 사용
      return Array.from(textElements).map((element) => {
        const start = element.getAttribute('start') || '0';
        const dur = element.getAttribute('dur') || '0';
        const text = element.textContent || '';

        return { start, dur, text };
      });
    } catch (error) {
      this.logger.error(
        '자막 파싱 실패:',
        error instanceof Error ? error.message : '알 수 없는 오류',
      );
      throw new Error('자막을 파싱할 수 없습니다.');
    }
  }
}

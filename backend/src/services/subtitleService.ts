import { getSubtitles } from "youtube-captions-scraper";
import {
  SubtitleItem,
  enhanceSubtitleItems,
  extractVideoID,
  fetchYouTubeVideoInfo,
} from "../utils/youtubeUtils";

interface VideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videoId: string;
}

export interface SubtitleRequest {
  url: string;
  language: string;
}

export interface SubtitleResponse {
  success: boolean;
  data: {
    subtitles: SubtitleItem[];
    text: string;
    videoInfo: VideoInfo;
  };
}

export class SubtitleService {
  // 비디오 정보 가져오기
  private async getVideoInfo(videoId: string): Promise<VideoInfo> {
    try {
      // 새로 구현한 함수를 사용하여 실제 YouTube 정보 가져오기
      return await fetchYouTubeVideoInfo(videoId);
    } catch (error) {
      console.error("비디오 정보 가져오기 실패:", error);
      // 오류 발생 시 기본 정보 반환
      return {
        title: `Video ${videoId}`,
        channelName: "YouTube Channel",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoId,
      };
    }
  }

  // YouTube 자막 가져오기
  public async getSubtitlesFromYoutube(
    params: SubtitleRequest
  ): Promise<SubtitleResponse> {
    try {
      const { url, language = "en" } = params;

      // 비디오 ID 추출
      const videoId = extractVideoID(url);
      if (!videoId) {
        throw new Error("유효하지 않은 YouTube URL입니다.");
      }

      let rawSubtitles;
      try {
        // YouTube 자막 가져오기
        rawSubtitles = await getSubtitles({
          videoID: videoId,
          lang: language,
        });

        if (!rawSubtitles || rawSubtitles.length === 0) {
          throw new Error(
            `요청한 언어(${language})로 자막을 찾을 수 없습니다.`
          );
        }
      } catch (error) {
        console.error(`${language} 자막 가져오기 실패:`, error);

        // 요청한 언어가 영어가 아니고, 자막을 찾을 수 없는 경우 영어 자막 시도
        if (language !== "en") {
          console.log("영어 자막으로 대체 시도");
          rawSubtitles = await getSubtitles({
            videoID: videoId,
            lang: "en",
          });

          if (!rawSubtitles || rawSubtitles.length === 0) {
            throw new Error("영어 자막도 찾을 수 없습니다.");
          }
        } else {
          throw error; // 이미 영어 자막을 요청했는데 실패한 경우 그냥 에러 전달
        }
      }

      // 자막 데이터 강화
      const enhancedSubtitles = enhanceSubtitleItems(rawSubtitles);

      // 전체 텍스트 추출
      const fullText = enhancedSubtitles.map((item) => item.text).join(" ");

      // 비디오 정보 가져오기
      const videoInfo = await this.getVideoInfo(videoId);

      return {
        success: true,
        data: {
          subtitles: enhancedSubtitles,
          text: fullText,
          videoInfo: videoInfo,
        },
      };
    } catch (error) {
      console.error("자막 가져오기 실패:", error);
      throw error;
    }
  }
}

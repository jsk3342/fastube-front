import { getSubtitles } from "youtube-captions-scraper";
import {
  SubtitleItem,
  enhanceSubtitleItems,
  extractVideoID,
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
  // 비디오 정보 가져오기 (실제로는 YouTube API를 사용하는 것이 좋지만, 여기서는 간단히 처리)
  private async getVideoInfo(videoId: string): Promise<VideoInfo> {
    // 실제 구현에서는 YouTube Data API를 사용하여 비디오 정보를 가져와야 함
    // 여기서는 예시로 더미 데이터 반환
    return {
      title: `Video ${videoId}`,
      channelName: "YouTube Channel",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      videoId,
    };
  }

  // YouTube 자막 가져오기
  public async getSubtitlesFromYoutube(
    params: SubtitleRequest
  ): Promise<SubtitleResponse> {
    try {
      const { url, language } = params;

      // 비디오 ID 추출
      const videoId = extractVideoID(url);
      if (!videoId) {
        throw new Error("유효하지 않은 YouTube URL입니다.");
      }

      // YouTube 자막 가져오기
      const rawSubtitles = await getSubtitles({
        videoID: videoId,
        lang: language || "ko",
      });

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

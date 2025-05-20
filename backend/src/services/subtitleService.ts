import {
  enhanceSubtitleItems,
  extractVideoID,
  fetchYouTubeVideoInfo,
  getSubtitlesDirectly,
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

interface SubtitleItem {
  text: string;
  start: number;
  duration: number;
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

      console.log(
        `[SubtitleService] 자막 추출 시작 - 비디오 ID: ${videoId}, 언어: ${language}`
      );

      // 1. 요청한 언어로 자막 가져오기 시도
      try {
        console.log(`[SubtitleService] ${language} 자막 가져오기 시도`);
        const response = await getSubtitlesDirectly(videoId, language);

        if (response.success && response.data.text) {
          console.log(`[SubtitleService] ${language} 자막 가져오기 성공`);
          return {
            success: true,
            data: {
              text: response.data.text,
              videoInfo: response.data.videoInfo || {
                title: "",
                channelName: "",
                thumbnailUrl: "",
                videoId,
              },
            },
          };
        }
      } catch (error) {
        console.error(
          `[SubtitleService] ${language} 자막 가져오기 실패:`,
          error
        );
      }

      // 2. 영어 자막으로 대체 시도
      if (language !== "en") {
        try {
          console.log("[SubtitleService] 영어 자막으로 대체 시도");
          const response = await getSubtitlesDirectly(videoId, "en");

          if (response.success && response.data.text) {
            console.log("[SubtitleService] 영어 자막 가져오기 성공");
            return {
              success: true,
              data: {
                text: response.data.text,
                videoInfo: response.data.videoInfo || {
                  title: "",
                  channelName: "",
                  thumbnailUrl: "",
                  videoId,
                },
              },
            };
          }
        } catch (error) {
          console.error("[SubtitleService] 영어 자막 가져오기 실패:", error);
        }
      }

      // 3. 모든 시도 실패
      console.error("[SubtitleService] 모든 자막 가져오기 시도 실패");
      throw new Error(`Could not find captions for video: ${videoId}`);
    } catch (error) {
      console.error("[SubtitleService] 자막 추출 중 오류 발생:", error);
      throw error;
    }
  }
}

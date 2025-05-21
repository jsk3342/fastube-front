import {
  enhanceSubtitleItems,
  extractVideoID,
  fetchYouTubeVideoInfo,
  getSubtitlesDirectly,
  getSubtitlesWithPuppeteer,
  getSubtitlesFromYouTube,
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
    videoId: string,
    language: string
  ): Promise<SubtitleResponse> {
    try {
      console.log(`[SubtitleService] ${language} 자막 가져오기 시도`);

      try {
        // 첫 번째 방식: Puppeteer를 사용한 자막 추출 (봇 감지 우회)
        const puppeteerResponse = await getSubtitlesWithPuppeteer(
          videoId,
          language
        );

        if (puppeteerResponse.success && puppeteerResponse.data.text) {
          console.log(
            `[SubtitleService] Puppeteer 방식으로 ${language} 자막 가져오기 성공`
          );
          return {
            success: true,
            data: {
              subtitles: [], // 현재 구현에서는 필요 없지만 타입 일치를 위해 빈 배열 추가
              text: puppeteerResponse.data.text,
              videoInfo: {
                ...(puppeteerResponse.data.videoInfo || {
                  title: "",
                  channelName: "",
                  thumbnailUrl: "",
                }),
                videoId,
              },
            },
          };
        }
        throw new Error("Puppeteer 응답에 자막이 없습니다.");
      } catch (puppeteerError: unknown) {
        const errorMessage =
          puppeteerError instanceof Error
            ? puppeteerError.message
            : String(puppeteerError);
        console.log(`[SubtitleService] Puppeteer 방식 실패: ${errorMessage}`);
        console.log("[SubtitleService] 대체 방식으로 시도합니다.");

        // 두 번째 방식: 직접 HTTP 요청을 사용하는 방식
        try {
          const directResponse = await getSubtitlesDirectly(videoId, language);

          if (directResponse.success && directResponse.data.text) {
            console.log(
              `[SubtitleService] 직접 요청 방식으로 ${language} 자막 가져오기 성공`
            );
            return {
              success: true,
              data: {
                subtitles: [], // 현재 구현에서는 필요 없지만 타입 일치를 위해 빈 배열 추가
                text: directResponse.data.text,
                videoInfo: {
                  ...(directResponse.data.videoInfo || {
                    title: "",
                    channelName: "",
                    thumbnailUrl: "",
                  }),
                  videoId,
                },
              },
            };
          }
          throw new Error("직접 요청 응답에 자막이 없습니다.");
        } catch (directError: unknown) {
          const errorMessage =
            directError instanceof Error
              ? directError.message
              : String(directError);
          console.log(`[SubtitleService] 직접 요청 방식 실패: ${errorMessage}`);

          // 세 번째 방식: 레거시 방식으로 시도
          const legacyResponse = await getSubtitlesFromYouTube(
            videoId,
            language
          );

          if (legacyResponse.success && legacyResponse.data.text) {
            console.log(
              `[SubtitleService] 레거시 방식으로 ${language} 자막 가져오기 성공`
            );
            return {
              success: true,
              data: {
                subtitles: [], // 현재 구현에서는 필요 없지만 타입 일치를 위해 빈 배열 추가
                text: legacyResponse.data.text,
                videoInfo: {
                  ...(legacyResponse.data.videoInfo || {
                    title: "",
                    channelName: "",
                    thumbnailUrl: "",
                  }),
                  videoId,
                },
              },
            };
          }
          throw new Error("레거시 응답에 자막이 없습니다.");
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(
        `[SubtitleService] ${language} 자막 가져오기 실패: ${errorMessage}`
      );
      throw new Error(`Could not find captions for video: ${videoId}`);
    }
  }

  async getSubtitles(params: SubtitleRequest): Promise<SubtitleResponse> {
    try {
      const { url, language = "ko" } = params;

      // 비디오 ID 추출
      const videoId = extractVideoID(url);
      if (!videoId) {
        throw new Error("유효하지 않은 YouTube URL입니다.");
      }

      console.log(
        `[SubtitleService] 자막 추출 시작 - 비디오 ID: ${videoId}, 언어: ${language}`
      );

      // YouTube 자막 가져오기 호출
      return await this.getSubtitlesFromYoutube(videoId, language);
    } catch (error) {
      console.error("자막 컨트롤러 오류:", error);
      throw error;
    }
  }
}

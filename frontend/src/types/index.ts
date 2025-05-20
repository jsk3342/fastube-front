// Subtitle 관련 타입 정의
export interface SubtitleItem {
  id: string;
  start: number;
  end: number;
  text: string;
}

// 비디오 정보 관련 타입 정의
export interface VideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videoId: string;
}

// 자막 API 응답 타입
export interface SubtitleResponse {
  success: boolean;
  data: {
    fullText: string;
    subtitles: SubtitleItem[];
    videoInfo: VideoInfo;
  };
}

// 자막 API 요청 타입
export interface SubtitleRequest {
  url: string;
  language: string;
}

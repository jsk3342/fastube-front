// Subtitle 관련 타입 정의
export interface SubtitleItem {
  id: string;
  start: string; // 시작 시간 (초)
  dur: string; // 지속 시간 (초)
  text: string;
  end?: number; // 종료 시간 (초) (프론트에서 계산)
  startFormatted?: string; // "00:00" 형식 (프론트에서 계산)
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

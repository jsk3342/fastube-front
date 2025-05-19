import { useMutation } from "@tanstack/react-query";
import { api } from "@/apis";
import { ENDPOINTS } from "@/apis/endpoints";

export interface SubtitleRequest {
  url: string;
  language: string;
}

export interface SubtitleItem {
  text: string;
  start: number; // 시작 시간 (초)
  end: number; // 종료 시간 (초)
  startFormatted: string; // "00:00" 형식
}

export interface SubtitleResponse {
  success: boolean;
  data: {
    subtitles: SubtitleItem[];
    fullText: string;
    videoInfo: {
      title: string;
      channelName: string;
      thumbnailUrl: string;
      videoId: string;
    };
    isDemo?: boolean;
  };
}

// YouTube URL에서 videoID를 추출하는 함수
export function extractVideoID(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11 ? match[2] : null;
}

export function useSubtitles() {
  return useMutation<SubtitleResponse, Error, SubtitleRequest>({
    mutationFn: async (params) => {
      const videoId = extractVideoID(params.url);

      if (!videoId) {
        throw new Error("유효한 YouTube URL이 아닙니다.");
      }

      try {
        console.log("자막 요청 중...", params);

        // 서버리스 함수에서 이미 가공된 데이터 받아오기
        const response = await api.post(ENDPOINTS.SUBTITLES, params);

        console.log("자막 응답 수신:", response.data);

        // 응답이 성공적이면 그대로 반환
        if (response.data && response.data.success) {
          // 서버리스 함수가 이미 완전히 가공된 데이터를 반환하므로 그대로 사용
          return response.data;
        } else {
          throw new Error(
            response.data?.error || "자막 데이터를 가져오는데 실패했습니다."
          );
        }
      } catch (error) {
        console.error("자막 처리 실패:", error);
        throw new Error("자막을 추출할 수 없습니다.");
      }
    },
  });
}

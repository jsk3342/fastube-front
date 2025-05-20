import { useQuery } from "@tanstack/react-query";
import { api } from "../index";
import { ENDPOINTS } from "../endpoints";
import { extractVideoID } from "./useSubtitles";

export interface VideoInfoResponse {
  success: boolean;
  data: {
    title: string;
    channelName: string;
    thumbnailUrl: string;
    duration: number;
    availableLanguages: string[];
  };
}

// 비디오 정보를 가져오는 훅
export function useVideoInfo(videoUrl: string | null) {
  const videoId = videoUrl ? extractVideoID(videoUrl) : null;

  return useQuery<VideoInfoResponse, Error>({
    queryKey: ["videoInfo", videoId],
    queryFn: async () => {
      if (!videoId) {
        throw new Error("유효한 비디오 ID가 아닙니다.");
      }

      try {
        // 백엔드 API 호출
        const { data } = await api.get<VideoInfoResponse>(
          `${ENDPOINTS.VIDEO_INFO}?id=${encodeURIComponent(videoId)}`
        );
        return data;
      } catch (error) {
        console.error("비디오 정보 가져오기 실패:", error);

        // 에러 발생 시 기본 정보 반환 (폴백)
      return {
        success: true,
        data: {
          title: "YouTube 비디오",
          channelName: "채널 이름",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: 0,
          availableLanguages: ["ko", "en"],
        },
      };
      }
    },
    enabled: !!videoId,
  });
}

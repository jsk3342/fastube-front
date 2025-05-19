import { useQuery } from "@tanstack/react-query";
// import { api } from "../index";  // 사용하지 않는 import 제거
// import { ENDPOINTS } from "../endpoints";  // 사용하지 않는 import 제거
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

      // 실제 API 연동은 여기서 하게 됩니다.
      // 여기서는 예시 데이터를 반환합니다.
      return {
        success: true,
        data: {
          title: "YouTube 비디오",
          channelName: "채널 이름",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: 120, // 2분짜리 영상
          availableLanguages: ["ko", "en"],
        },
      };
    },
    enabled: !!videoId,
  });
}

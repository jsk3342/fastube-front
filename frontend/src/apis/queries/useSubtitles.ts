import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { api } from "../index";
import { ENDPOINTS } from "../endpoints";
import type {
  SubtitleItem,
  SubtitleRequest,
  SubtitleResponse,
  VideoInfo,
} from "@/types";

/**
 * YouTube URL에서 비디오 ID를 추출합니다.
 * 다양한 형태의 YouTube URL을 지원합니다.
 */
export function extractVideoID(url: string): string | null {
  if (!url) return null;

  // 일반적인 YouTube URL 패턴들
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?/]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^?/]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?/]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^?/]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * 자막 추출 API를 호출하는 커스텀 훅
 */
export function useSubtitles(
  options?: Omit<
    UseMutationOptions<SubtitleResponse, Error, SubtitleRequest>,
    "mutationFn"
  >
) {
  return useMutation<SubtitleResponse, Error, SubtitleRequest>({
    mutationFn: async (params) => {
      const { data } = await api.post<SubtitleResponse>(
        ENDPOINTS.SUBTITLES,
        params
      );
      return data;
    },
    ...options,
  });
}

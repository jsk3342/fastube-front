import { useMutation } from "@tanstack/react-query";
import { api } from "../index";
import { ENDPOINTS } from "../endpoints";

export interface SubtitleRequest {
  url: string;
  language: string;
}

export interface SubtitleItem {
  text: string;
  start: string; // 시작 시간 (초)
  dur: string; // 지속 시간 (초)
  startFormatted?: string; // "00:00" 형식 (프론트에서 계산)
  end?: number; // 종료 시간 (초) (프론트에서 계산)
}

export interface VideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videoId: string;
}

export interface SubtitleResponse {
  success: boolean;
  data: {
    subtitles: SubtitleItem[];
    text: string; // 백엔드에서는 fullText가 아닌 text로 응답
    videoInfo: {
      title: string;
      channelName: string;
      thumbnailUrl: string;
    };
  };
}

// YouTube URL에서 videoID를 추출하는 함수
export function extractVideoID(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11 ? match[2] : null;
}

// 초 단위를 "00:00" 형식으로 변환하는 함수
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

// HTML 엔티티를 정상 문자로 변환하는 함수
const decodeHtmlEntities = (text: string): string => {
  // 숫자 참조 형식 HTML 엔티티(&#39; 등) 변환을 위한 임시 요소 생성
  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  let decoded = textArea.value;

  // 이름 참조 형식 엔티티(&quot; 등) 수동 변환
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&apos;": "'",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };

  decoded = decoded.replace(
    /&quot;|&apos;|&amp;|&lt;|&gt;|&nbsp;/g,
    (match) => entities[match] || match
  );

  return decoded;
};

// SubtitleItem 배열에 추가 정보를 계산하여 확장된 배열 반환
const enhanceSubtitleItems = (
  subtitles: SubtitleItem[]
): (SubtitleItem & { startFormatted: string; end: number })[] => {
  return subtitles.map((item) => {
    const start = parseFloat(item.start);
    const dur = parseFloat(item.dur);

    return {
      ...item,
      text: decodeHtmlEntities(item.text), // HTML 엔티티 디코딩
      startFormatted: formatTime(start),
      end: start + dur,
    };
  });
};

export function useSubtitles() {
  return useMutation<
    {
      success: boolean;
      data: {
        subtitles: SubtitleItem[];
        fullText: string;
        videoInfo: VideoInfo;
      };
    },
    Error,
    SubtitleRequest
  >({
    mutationFn: async (params) => {
      // 백엔드 API 호출
      const { data } = await api.post<SubtitleResponse>(
        ENDPOINTS.SUBTITLES,
        params
      );

      console.log("data", data);

      // 백엔드 응답을 프론트엔드 형식으로 변환
      const enhancedSubtitles = enhanceSubtitleItems(data.data.subtitles);

      // 텍스트 필드명 변환 (text → fullText)
      const responseData = {
        success: data.success,
        data: {
          subtitles: enhancedSubtitles,
          fullText: data.data.text,
          videoInfo: {
            ...data.data.videoInfo,
            videoId: extractVideoID(params.url) || "",
          },
        },
      };

      return responseData;
    },
  });
}

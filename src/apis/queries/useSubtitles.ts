import { useMutation } from "@tanstack/react-query";
import { type Caption } from "youtube-captions-scraper";
import { getYouTubeSubtitles, getVideoInfo } from "@/utils/youtubeCaptions";

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

// Caption 배열을 SubtitleItem 배열로 변환하는 함수
const convertCaptionsToSubtitleItems = (
  captions: Caption[]
): SubtitleItem[] => {
  return captions.map((caption) => {
    const start = parseFloat(caption.start);
    const dur = parseFloat(caption.dur);

    return {
      text: decodeHtmlEntities(caption.text),
      start,
      end: start + dur,
      startFormatted: formatTime(start),
    };
  });
};

export function useSubtitles() {
  return useMutation<SubtitleResponse, Error, SubtitleRequest>({
    mutationFn: async (params) => {
      const videoId = extractVideoID(params.url);

      if (!videoId) {
        throw new Error("유효한 YouTube URL이 아닙니다.");
      }

      try {
        // 병렬로 자막과 비디오 정보 가져오기
        const [captions, videoDetails] = await Promise.all([
          getYouTubeSubtitles(videoId, params.language),
          getVideoInfo(videoId),
        ]);

        // 자막 아이템으로 변환 (타임스탬프 정보 포함)
        const subtitles = convertCaptionsToSubtitleItems(captions);

        // 전체 텍스트 조합 (HTML 엔티티 변환 적용)
        const fullText = subtitles.map((item) => item.text).join(" ");

        // 응답 형태로 가공
        return {
          success: true,
          data: {
            subtitles,
            fullText,
            videoInfo: {
              title: videoDetails.title,
              channelName: videoDetails.channelName,
              thumbnailUrl: videoDetails.thumbnailUrl,
              videoId,
            },
          },
        };
      } catch (error) {
        console.error("자막 처리 실패:", error);
        throw new Error("자막을 추출할 수 없습니다.");
      }
    },
  });
}

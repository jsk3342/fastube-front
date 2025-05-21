import { getSubtitles } from "youtube-captions-scraper";

// YouTube URL에서 videoID를 추출하는 함수
export function extractVideoID(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11 ? match[2] : null;
}

// 초 단위를 "00:00" 형식으로 변환하는 함수
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

// HTML 엔티티를 정상 문자로 변환하는 함수
export const decodeHtmlEntities = (text: string): string => {
  // 이름 참조 형식 엔티티(&quot; 등) 수동 변환
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&apos;": "'",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };

  let decoded = text.replace(
    /&quot;|&apos;|&amp;|&lt;|&gt;|&nbsp;/g,
    (match) => entities[match] || match
  );

  // 숫자 참조 형식 엔티티(&#39; 등) 처리
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  return decoded;
};

export interface SubtitleItem {
  text: string;
  start: string | number; // 시작 시간 (초)
  dur: string | number; // 지속 시간 (초)
  startFormatted?: string; // "00:00" 형식
  end?: number; // 종료 시간 (초)
}

// SubtitleItem 배열에 추가 정보를 계산하여 확장된 배열 반환
export const enhanceSubtitleItems = (
  subtitles: SubtitleItem[]
): (SubtitleItem & { startFormatted: string; end: number })[] => {
  return subtitles.map((item) => {
    const start =
      typeof item.start === "string" ? parseFloat(item.start) : item.start;
    const dur = typeof item.dur === "string" ? parseFloat(item.dur) : item.dur;

    return {
      ...item,
      text: decodeHtmlEntities(item.text), // HTML 엔티티 디코딩
      startFormatted: formatTime(start),
      end: start + dur,
    };
  });
};

// YouTube 비디오 정보 가져오기
export async function fetchYouTubeVideoInfo(videoId: string) {
  try {
    // YouTube 비디오 페이지에서 메타데이터 스크랩
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    // 비디오 제목 추출
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const fullTitle = titleMatch ? titleMatch[1] : `Video ${videoId}`;

    // 비디오 제목에서 채널명 분리 (YouTube 제목 형식: "비디오 제목 - 채널명")
    let title = fullTitle;
    let channelName = "YouTube Channel";

    if (fullTitle.includes(" - YouTube")) {
      title = fullTitle.replace(" - YouTube", "");
    }

    // 채널명 추출 시도
    const channelMatch = html.match(/"ownerChannelName":"(.*?)"/);
    if (channelMatch && channelMatch[1]) {
      channelName = decodeHtmlEntities(channelMatch[1]);
    }

    // 더 정확한 제목 추출 시도
    const videoTitleMatch = html.match(/"title":"(.*?)"/);
    if (videoTitleMatch && videoTitleMatch[1]) {
      title = decodeHtmlEntities(videoTitleMatch[1]);
    }

    return {
      title,
      channelName,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      videoId,
    };
  } catch (error) {
    console.error("YouTube 비디오 정보 가져오기 실패:", error);
    // 스크랩 실패 시 기본 정보 반환
    return {
      title: `Video ${videoId}`,
      channelName: "YouTube Channel",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      videoId,
    };
  }
}

interface SubtitleResponse {
  success: boolean;
  data: {
    text: string;
    videoInfo?: {
      title: string;
      channelName: string;
      thumbnailUrl: string;
    };
  };
}

/**
 * youtube-captions-scraper 라이브러리를 사용하여 자막 가져오기
 */
export async function getSubtitlesFromYouTube(
  videoId: string,
  language: string
): Promise<SubtitleResponse> {
  console.log(`[자막 추출 시작] 비디오 ID: ${videoId}, 언어: ${language}`);

  try {
    // 자막 가져오기
    console.log(`[2단계] 자막 가져오기 시작 (언어: ${language})...`);
    const captions = await getSubtitles({
      videoID: videoId,
      lang: language,
    });
    console.log(`[자막 추출 성공] ${captions.length}개 항목`);

    if (!captions || captions.length === 0) {
      console.error("[오류] 자막이 없습니다.");
      return {
        success: false,
        data: {
          text: `Could not find captions for video: ${videoId}`,
        },
      };
    }

    // 자막 정보 향상
    const enhancedCaptions = enhanceSubtitleItems(captions);

    // 비디오 정보 가져오기
    console.log("[3단계] 비디오 정보 가져오기 시작...");
    const videoInfo = await fetchYouTubeVideoInfo(videoId);

    // 자막을 하나의 텍스트로 합치기
    const fullText = enhancedCaptions
      .map((c) => c.text)
      .join("\n")
      .trim();

    return {
      success: true,
      data: {
        text: fullText,
        videoInfo: {
          title: videoInfo.title,
          channelName: videoInfo.channelName,
          thumbnailUrl: videoInfo.thumbnailUrl,
        },
      },
    };
  } catch (error: any) {
    console.error("[자막 추출 실패]", error);
    return {
      success: false,
      data: {
        text: `Failed to extract subtitles: ${error.message}`,
      },
    };
  }
}

/**
 * 메인 자막 추출 함수 - youtube-captions-scraper를 사용합니다
 */
export async function getSubtitlesDirectly(
  videoId: string,
  language = "en"
): Promise<SubtitleResponse> {
  return getSubtitlesFromYouTube(videoId, language);
}

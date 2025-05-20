import he from "he";
import axios from "axios";
import { find } from "lodash";
import striptags from "striptags";

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
  start: string; // 시작 시간 (초)
  dur: string; // 지속 시간 (초)
  startFormatted?: string; // "00:00" 형식
  end?: number; // 종료 시간 (초)
}

// SubtitleItem 배열에 추가 정보를 계산하여 확장된 배열 반환
export const enhanceSubtitleItems = (
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

// YouTube Open Graph 메타데이터를 스크랩하여 비디오 정보 가져오기
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

interface Subtitle {
  text: string;
  start: number;
  duration: number;
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

export async function getSubtitlesDirectly(
  videoId: string,
  language: string = "ko"
): Promise<SubtitleResponse> {
  console.log(`[자막 추출 시작] 비디오 ID: ${videoId}, 언어: ${language}`);

  try {
    // 1. 자막 목록 가져오기
    console.log("[1단계] 자막 목록 요청 중...");
    const response = await axios.get(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );
    console.log("[1단계] 자막 목록 응답 받음");

    // 2. 자막 데이터 추출
    console.log("[2단계] 자막 데이터 파싱 중...");
    const html = response.data;
    const captionsMatch = html.match(/"captions":\s*({[^}]+})/);

    if (!captionsMatch) {
      console.log("[2단계] 자막 데이터를 찾을 수 없음");
      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    const captionsData = JSON.parse(captionsMatch[1]);
    console.log("[2단계] 자막 데이터 파싱 완료");

    // 3. 자막 URL 찾기
    console.log("[3단계] 자막 URL 찾는 중...");
    const playerResponseMatch = html.match(
      /"playerCaptionsTracklistRenderer":\s*({[^}]+})/
    );

    if (!playerResponseMatch) {
      console.log("[3단계] 플레이어 응답을 찾을 수 없음");
      throw new Error(`Could not find player response for video: ${videoId}`);
    }

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    console.log("[3단계] 플레이어 응답 파싱 완료");

    // 4. 자막 URL 추출
    console.log("[4단계] 자막 URL 추출 중...");
    const captionTracks = playerResponse.captionTracks || [];
    console.log(`[4단계] 사용 가능한 자막 트랙 수: ${captionTracks.length}`);

    const targetCaption = captionTracks.find(
      (track: any) => track.languageCode === language
    );

    if (!targetCaption) {
      console.log(`[4단계] ${language} 자막을 찾을 수 없음`);
      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    const captionUrl = targetCaption.baseUrl;
    console.log(`[4단계] 자막 URL 찾음: ${captionUrl}`);

    // 5. 자막 데이터 가져오기
    console.log("[5단계] 자막 데이터 다운로드 중...");
    const captionResponse = await axios.get(captionUrl);
    console.log("[5단계] 자막 데이터 다운로드 완료");

    // 6. 자막 파싱
    console.log("[6단계] 자막 파싱 중...");
    const subtitles = parseSubtitles(captionResponse.data);
    console.log(`[6단계] 파싱된 자막 수: ${subtitles.length}`);

    // 7. 자막 텍스트 추출
    console.log("[7단계] 자막 텍스트 추출 중...");
    const text = subtitles.map((subtitle) => subtitle.text).join("\n");
    console.log("[7단계] 자막 텍스트 추출 완료");

    // 8. 비디오 정보 추출
    console.log("[8단계] 비디오 정보 추출 중...");
    const videoInfo = extractVideoInfo(html);
    console.log("[8단계] 비디오 정보 추출 완료");

    return {
      success: true,
      data: {
        text,
        videoInfo,
      },
    };
  } catch (error) {
    console.error("[자막 추출 실패] 상세 에러:", error);
    throw error;
  }
}

function parseSubtitles(xmlData: string): Subtitle[] {
  console.log("[자막 파싱] XML 데이터 파싱 시작");
  const subtitles: Subtitle[] = [];
  const textRegex = /<text[^>]*>(.*?)<\/text>/g;
  const startRegex = /start="([^"]+)"/;
  const durRegex = /dur="([^"]+)"/;

  let match;
  while ((match = textRegex.exec(xmlData)) !== null) {
    const text = he.decode(match[1].replace(/<[^>]+>/g, ""));
    const startMatch = startRegex.exec(match[0]);
    const durMatch = durRegex.exec(match[0]);

    if (startMatch && durMatch) {
      subtitles.push({
        text,
        start: parseFloat(startMatch[1]),
        duration: parseFloat(durMatch[1]),
      });
    }
  }

  console.log(`[자막 파싱] 총 ${subtitles.length}개의 자막 파싱 완료`);
  return subtitles;
}

function extractVideoInfo(html: string) {
  console.log("[비디오 정보 추출] 시작");
  try {
    const titleMatch = html.match(/"title":"([^"]+)"/);
    const channelMatch = html.match(/"channelName":"([^"]+)"/);
    const thumbnailMatch = html.match(/"thumbnailUrl":"([^"]+)"/);

    const videoInfo = {
      title: titleMatch ? he.decode(titleMatch[1]) : "Unknown Title",
      channelName: channelMatch
        ? he.decode(channelMatch[1])
        : "Unknown Channel",
      thumbnailUrl: thumbnailMatch ? he.decode(thumbnailMatch[1]) : "",
    };

    console.log("[비디오 정보 추출] 완료:", videoInfo);
    return videoInfo;
  } catch (error) {
    console.error("[비디오 정보 추출] 실패:", error);
    return {
      title: "Unknown Title",
      channelName: "Unknown Channel",
      thumbnailUrl: "",
    };
  }
}

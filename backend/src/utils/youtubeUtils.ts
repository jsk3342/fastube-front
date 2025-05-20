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

/**
 * YouTube 비디오에서 자막을 직접 추출하는 함수
 * 외부 라이브러리 대신 직접 구현한 방식을 사용
 */
export async function getSubtitlesDirectly({
  videoID,
  lang = "en",
}: {
  videoID: string;
  lang: string;
}) {
  try {
    console.log(`[자막 추출 시작] 비디오 ID: ${videoID}, 요청 언어: ${lang}`);

    const { data } = await axios.get(`https://youtube.com/watch?v=${videoID}`);
    console.log(`[YouTube 페이지 로드 성공] 크기: ${data.length} 바이트`);

    // 자막 데이터에 접근할 수 있는지 확인
    if (!data.includes("captionTracks")) {
      console.log(`[자막 없음] captionTracks를 찾을 수 없음: ${videoID}`);
      throw new Error(`Could not find captions for video: ${videoID}`);
    }

    const regex = /"captionTracks":(\[.*?\])/;
    const match = regex.exec(data);

    if (!match || !match[1]) {
      console.log(`[자막 트랙 추출 실패] 정규식 매칭 실패: ${videoID}`);
      throw new Error(`Could not extract caption tracks for video: ${videoID}`);
    }

    const { captionTracks } = JSON.parse(`{"captionTracks":${match[1]}}`);
    console.log(
      `[자막 트랙 발견] 사용 가능한 자막:`,
      JSON.stringify(captionTracks)
    );

    const subtitle =
      find(captionTracks, {
        vssId: `.${lang}`,
      }) ||
      find(captionTracks, {
        vssId: `a.${lang}`,
      }) ||
      find(
        captionTracks,
        ({ vssId }: { vssId: string }) => vssId && vssId.match(`.${lang}`)
      );

    // 요청한 언어의 자막이 있는지 확인
    if (!subtitle || (subtitle && !subtitle.baseUrl)) {
      console.log(`[자막 없음] ${lang} 자막을 찾을 수 없음: ${videoID}`);
      throw new Error(`Could not find ${lang} captions for ${videoID}`);
    }

    console.log(`[자막 URL 발견] ${lang} 자막 URL: ${subtitle.baseUrl}`);
    const transcriptResponse = await axios.get(subtitle.baseUrl);
    console.log(
      `[자막 다운로드 성공] 크기: ${transcriptResponse.data.length} 바이트`
    );

    const transcript = transcriptResponse.data;

    const lines = transcript
      .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', "")
      .replace("</transcript>", "")
      .split("</text>")
      .filter((line: string) => line && line.trim())
      .map((line: string) => {
        const startRegex = /start="([\d.]+)"/;
        const durRegex = /dur="([\d.]+)"/;

        const startMatch = startRegex.exec(line);
        const durMatch = durRegex.exec(line);

        if (!startMatch || !durMatch) {
          return null;
        }

        const start = startMatch[1];
        const dur = durMatch[1];

        const htmlText = line
          .replace(/<text.+>/, "")
          .replace(/&amp;/gi, "&")
          .replace(/<\/?[^>]+(>|$)/g, "");

        const decodedText = he.decode(htmlText);
        const text = striptags(decodedText);

        return {
          start,
          dur,
          text,
        };
      })
      .filter(Boolean); // null 값 제거

    console.log(`[자막 파싱 완료] 총 ${lines.length}개의 자막 라인 추출됨`);
    return lines;
  } catch (error) {
    console.error("[자막 추출 실패] 상세 에러:", error);
    throw error;
  }
}

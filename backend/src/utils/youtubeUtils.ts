import he from "he";
import axios from "axios";
import { find } from "lodash";
import striptags from "striptags";
import ytdl from "ytdl-core";

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
export async function getSubtitlesDirectly(
  videoId: string,
  language: string = "ko"
): Promise<string> {
  try {
    console.log(
      `[자막 추출 시작] 비디오 ID: ${videoId}, 요청 언어: ${language}`
    );

    const video = await ytdl.getInfo(videoId);
    console.log(`[비디오 정보 조회 성공] 제목: ${video.videoDetails.title}`);

    const captions = video.player_response.captions;
    console.log(
      `[자막 정보] 사용 가능한 자막 트랙:`,
      JSON.stringify(
        captions?.playerCaptionsTracklistRenderer?.captionTracks || []
      )
    );

    if (!captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      console.log(`[자막 없음] 이 비디오에는 자막이 없습니다: ${videoId}`);
      throw new Error(`이 비디오에는 자막이 없습니다: ${videoId}`);
    }

    const captionTrack =
      captions.playerCaptionsTracklistRenderer.captionTracks.find(
        (track: any) => track.languageCode === language
      );

    if (!captionTrack) {
      console.log(
        `[자막 없음] ${language} 자막을 찾을 수 없습니다. 영어 자막으로 대체 시도`
      );
      const englishTrack =
        captions.playerCaptionsTracklistRenderer.captionTracks.find(
          (track: any) => track.languageCode === "en"
        );

      if (!englishTrack) {
        console.log(`[자막 없음] 영어 자막도 찾을 수 없습니다.`);
        throw new Error(
          `이 비디오에는 ${language} 또는 영어 자막이 없습니다: ${videoId}`
        );
      }

      console.log(
        `[자막 찾음] 영어 자막 트랙 발견:`,
        JSON.stringify(englishTrack)
      );
      const response = await axios.get(englishTrack.baseUrl);
      console.log(
        `[자막 다운로드 성공] 영어 자막 크기: ${response.data.length} 바이트`
      );
      return response.data;
    }

    console.log(
      `[자막 찾음] ${language} 자막 트랙 발견:`,
      JSON.stringify(captionTrack)
    );
    const response = await axios.get(captionTrack.baseUrl);
    console.log(
      `[자막 다운로드 성공] ${language} 자막 크기: ${response.data.length} 바이트`
    );
    return response.data;
  } catch (error) {
    console.error(`[자막 추출 실패] 상세 에러:`, error);
    throw error;
  }
}

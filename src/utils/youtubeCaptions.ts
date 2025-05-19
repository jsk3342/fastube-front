/**
 * YouTube 자막 추출 유틸리티
 * CORS 문제를 우회하기 위해 Vite 프록시 서버를 사용합니다.
 */

import { type Caption } from "youtube-captions-scraper";
import axios from "axios";
import { api } from "@/apis";
import { ENDPOINTS } from "@/apis/endpoints";

interface YouTubeSubtitleTrack {
  baseUrl: string;
  name: { simpleText: string };
  languageCode: string;
  kind?: string;
  isTranslatable?: boolean;
}

export interface VideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

// YouTube 비디오에서 사용 가능한 자막 트랙 목록 가져오기
export async function getSubtitleTracks(
  videoId: string
): Promise<YouTubeSubtitleTrack[]> {
  try {
    // 비디오 페이지 가져오기
    const response = await axios.get(`/api/video-info/watch?v=${videoId}`);
    const html = response.data;

    // 자막 정보 추출
    const playerConfigMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*({.*?});/s
    );
    if (!playerConfigMatch || !playerConfigMatch[1]) {
      throw new Error("비디오 정보를 가져올 수 없습니다.");
    }

    const playerConfig = JSON.parse(playerConfigMatch[1]);
    const captionTracks =
      playerConfig?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
      [];

    return captionTracks;
  } catch (error) {
    console.error("자막 트랙 가져오기 실패:", error);
    throw new Error("자막 목록을 가져올 수 없습니다.");
  }
}

// 특정 언어의 자막 트랙 URL 찾기
export async function getSubtitleTrackUrl(
  videoId: string,
  languageCode: string = "ko"
): Promise<string | null> {
  try {
    const tracks = await getSubtitleTracks(videoId);

    // 요청된 언어 코드와 일치하는 자막 트랙 찾기
    const track = tracks.find((track) => track.languageCode === languageCode);

    // 일치하는 트랙이 없으면 첫 번째 트랙 사용 (또는 null 반환)
    return track ? track.baseUrl : tracks.length > 0 ? tracks[0].baseUrl : null;
  } catch (error) {
    console.error("자막 URL 가져오기 실패:", error);
    return null;
  }
}

// XML 자막 가져오기 및 파싱
export async function getSubtitlesFromUrl(url: string): Promise<Caption[]> {
  try {
    // XML 형식 자막 가져오기 (프록시 사용)
    const proxyUrl = url.replace("https://www.youtube.com", "/api/youtube");
    const response = await axios.get(proxyUrl);
    const xml = response.data;

    // XML 파싱
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");
    const textElements = xmlDoc.getElementsByTagName("text");

    // Caption 형식으로 변환
    const captions: Caption[] = Array.from(textElements).map((element) => {
      const start = element.getAttribute("start") || "0";
      const dur = element.getAttribute("dur") || "0";
      const text = element.textContent || "";

      return { start, dur, text };
    });

    return captions;
  } catch (error) {
    console.error("자막 파싱 실패:", error);
    throw new Error("자막을 파싱할 수 없습니다.");
  }
}

// YouTube 자막을 가져오는 함수
export async function getYouTubeSubtitles(
  videoId: string,
  language = "ko"
): Promise<Caption[]> {
  try {
    console.log(`자막 요청: 비디오 ID=${videoId}, 언어=${language}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // API 요청 경로 로깅
    console.log(`API 요청 경로: ${api.defaults.baseURL}${ENDPOINTS.SUBTITLES}`);

    const response = await api.post(ENDPOINTS.SUBTITLES, { url, language });
    console.log("자막 API 응답:", response.status, response.statusText);

    if (response.data.success && response.data.data.subtitles) {
      // 서버에서 받은 자막 데이터를 Caption 형식으로 변환
      return response.data.data.subtitles.map((item: any) => ({
        start: item.start.toString(),
        dur: "5", // 고정된 지속 시간
        text: item.text,
      }));
    }

    throw new Error("자막을 가져올 수 없습니다.");
  } catch (error) {
    console.error("자막 트랙 가져오기 실패:", error);
    throw error;
  }
}

// YouTube 비디오 정보를 가져오는 함수
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  try {
    console.log(`비디오 정보 요청: 비디오 ID=${videoId}`);

    // API 요청 경로 로깅
    console.log(
      `API 요청 경로: ${api.defaults.baseURL}${ENDPOINTS.VIDEO_INFO}?v=${videoId}`
    );

    const response = await api.get(`${ENDPOINTS.VIDEO_INFO}?v=${videoId}`);
    console.log("비디오 정보 API 응답:", response.status, response.statusText);

    if (response.data.success && response.data.data) {
      return {
        title: response.data.data.title,
        channelName: response.data.data.channelName,
        thumbnailUrl: response.data.data.thumbnailUrl,
      };
    }

    throw new Error("비디오 정보를 가져올 수 없습니다.");
  } catch (error) {
    console.error("비디오 정보 가져오기 실패:", error);
    throw error;
  }
}

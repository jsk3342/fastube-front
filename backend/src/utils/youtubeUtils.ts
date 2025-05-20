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
    console.log(`[요청 URL] https://www.youtube.com/watch?v=${videoId}`);
    console.log(
      `[요청 헤더] User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36`
    );

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
    console.log(`[응답 상태코드] ${response.status}`);
    console.log(`[응답 헤더] ${JSON.stringify(response.headers)}`);
    console.log(`[응답 데이터 크기] ${response.data?.length || 0} 바이트`);

    // HTML 전체를 로깅하면 너무 많으니 일부만 로깅
    const htmlPreview =
      response.data.substring(0, 500) +
      "... (중략) ..." +
      response.data.substring(response.data.length - 500);
    console.log(`[응답 HTML 미리보기] ${htmlPreview}`);

    // 2. 자막 데이터 추출
    console.log("[2단계] 자막 데이터 파싱 중...");
    const html = response.data;

    // YouTube 응답 구조에서 핵심 데이터 추출을 위한 다양한 패턴 시도
    // 1. 원래 패턴
    const captionsMatch = html.match(/"captions":\s*({[^}]+})/);

    // 2. playerResponse 구조 내 자막 정보 찾기 시도
    const playerResponseMatch = html.match(
      /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/
    );
    let playerResponseData = null;
    if (playerResponseMatch && playerResponseMatch[1]) {
      try {
        playerResponseData = JSON.parse(playerResponseMatch[1]);
        console.log("[플레이어 응답] 구조 발견");

        // 핵심 구조 로깅
        if (playerResponseData) {
          if (playerResponseData.captions) {
            console.log("[플레이어 응답] captions 키 존재");
            console.log(
              `[플레이어 응답] captions 구조: ${JSON.stringify(playerResponseData.captions).substring(0, 500)}...`
            );
          } else {
            console.log("[플레이어 응답] captions 키 없음");
          }

          // 대체 경로 확인
          const captionTracks =
            playerResponseData.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captionTracks) {
            console.log(
              `[플레이어 응답] captionTracks 발견: ${JSON.stringify(captionTracks).substring(0, 500)}...`
            );

            // 여기에서 직접 자막 트랙 처리 가능
            if (captionTracks.length > 0) {
              console.log(
                `[플레이어 응답] 총 ${captionTracks.length}개 자막 트랙 발견`
              );

              // 사용 가능한 모든 언어 출력
              const availableLanguages = captionTracks
                .map(
                  (track: any) =>
                    `${track.languageCode}(${track.name?.simpleText || "Unknown"})`
                )
                .join(", ");
              console.log(
                `[플레이어 응답] 사용 가능한 언어: ${availableLanguages}`
              );

              // 요청된 언어 또는 영어 자막 찾기
              const targetCaption =
                captionTracks.find(
                  (track: any) => track.languageCode === language
                ) ||
                captionTracks.find((track: any) => track.languageCode === "en");

              if (targetCaption && targetCaption.baseUrl) {
                const captionUrl = targetCaption.baseUrl;
                console.log(
                  `[플레이어 응답] ${targetCaption.languageCode} 자막 URL 발견: ${captionUrl}`
                );

                try {
                  // 5. 자막 데이터 가져오기
                  console.log("[5단계] 자막 데이터 다운로드 중...");
                  console.log(`[자막 요청 URL] ${captionUrl}`);

                  const captionResponse = await axios.get(captionUrl);
                  console.log("[5단계] 자막 데이터 다운로드 완료");
                  console.log(`[자막 응답 상태코드] ${captionResponse.status}`);
                  console.log(
                    `[자막 응답 데이터 크기] ${captionResponse.data?.length || 0} 바이트`
                  );
                  console.log(
                    `[자막 응답 데이터 RAW] ${captionResponse.data.substring(0, 1000)}... (생략)`
                  );

                  // 6. 자막 파싱
                  console.log("[6단계] 자막 파싱 중...");
                  const subtitles = parseSubtitles(captionResponse.data);
                  console.log(`[6단계] 파싱된 자막 수: ${subtitles.length}`);
                  if (subtitles.length > 0) {
                    console.log(
                      `[6단계] 첫 번째 자막: ${JSON.stringify(subtitles[0])}`
                    );
                    console.log(
                      `[6단계] 마지막 자막: ${JSON.stringify(subtitles[subtitles.length - 1])}`
                    );
                  }

                  // 7. 자막 텍스트 추출
                  console.log("[7단계] 자막 텍스트 추출 중...");
                  const subtitleText = subtitles
                    .map((subtitle) => subtitle.text)
                    .join("\n");
                  console.log(
                    `[7단계] 자막 텍스트 길이: ${subtitleText.length} 자`
                  );
                  console.log(
                    `[7단계] 자막 텍스트 샘플: ${subtitleText.substring(0, 200)}... (생략)`
                  );

                  // 8. 비디오 정보 추출
                  console.log("[8단계] 비디오 정보 추출 중...");
                  const extractedVideoInfo = extractVideoInfo(
                    html,
                    playerResponseData
                  );
                  console.log(
                    `[8단계] 비디오 정보 추출 완료: ${JSON.stringify(extractedVideoInfo)}`
                  );

                  return {
                    success: true,
                    data: {
                      text: subtitleText,
                      videoInfo: extractedVideoInfo,
                    },
                  };
                } catch (captionError: any) {
                  console.error(
                    `[자막 데이터 다운로드 실패] ${captionError.message}`
                  );
                  console.error(
                    `[자막 에러 상세] ${JSON.stringify(captionError.response || {})}`
                  );
                  // 오류가 발생해도 계속 진행하여 다른 방법 시도
                }
              }
            }
          }
        }
      } catch (parseError: any) {
        console.error(`[플레이어 응답] JSON 파싱 실패: ${parseError.message}`);
        // 파싱 실패 시 원래 로직으로 계속 진행
      }
    } else {
      console.log("[플레이어 응답] 구조 찾지 못함");
    }

    // 3. 대체 패턴: ytInitialData에서 자막 정보 찾기
    const initialDataMatch = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
    if (initialDataMatch && initialDataMatch[1]) {
      try {
        const initialData = JSON.parse(initialDataMatch[1]);
        console.log("[초기 데이터] 구조 발견");

        // 자막 관련 키워드 탐색
        const hasSubtitles =
          JSON.stringify(initialData).includes("caption") ||
          JSON.stringify(initialData).includes("subtitle");

        console.log(`[초기 데이터] 자막 관련 키워드 포함: ${hasSubtitles}`);
      } catch (parseError) {
        console.error(`[초기 데이터] JSON 파싱 실패: ${parseError}`);
      }
    } else {
      console.log("[초기 데이터] 구조 찾지 못함");
    }

    // 4. 또 다른 패턴: window["ytInitialPlayerResponse"]
    const windowPlayerResponseMatch = html.match(
      /window\["ytInitialPlayerResponse"\]\s*=\s*({.+?});/
    );
    if (windowPlayerResponseMatch && windowPlayerResponseMatch[1]) {
      try {
        const windowPlayerResponse = JSON.parse(windowPlayerResponseMatch[1]);
        console.log("[윈도우 플레이어 응답] 구조 발견");

        if (windowPlayerResponse.captions) {
          console.log("[윈도우 플레이어 응답] captions 키 존재");
          console.log(
            `[윈도우 플레이어 응답] captions 구조: ${JSON.stringify(windowPlayerResponse.captions).substring(0, 500)}...`
          );

          // 추가 처리 가능...
        }
      } catch (parseError) {
        console.error(`[윈도우 플레이어 응답] JSON 파싱 실패: ${parseError}`);
      }
    } else {
      console.log("[윈도우 플레이어 응답] 구조 찾지 못함");
    }

    // 5. 응답에서 'caption' 또는 'subtitle' 키워드가 포함된 문자열 추출
    const captionKeywordMatches = html.match(
      /(?:"[^"]*(?:caption|subtitle)[^"]*")/gi
    );
    if (captionKeywordMatches && captionKeywordMatches.length > 0) {
      console.log(
        `[키워드 검색] 'caption/subtitle' 관련 키 ${captionKeywordMatches.length}개 발견`
      );
      console.log(
        `[키워드 검색] 처음 10개: ${captionKeywordMatches.slice(0, 10).join(", ")}`
      );
    } else {
      console.log("[키워드 검색] caption/subtitle 관련 키 없음");
    }

    // 위 모든 방법으로 자막을 찾지 못한 경우, 원래 로직으로 진행
    if (!captionsMatch) {
      console.log("[2단계] 자막 데이터를 찾을 수 없음");
      console.log(
        `[전체 HTML 검색] "captions": 문자열 검색 결과: ${html.includes('"captions"')}`
      );
      console.log(`[정규식 결과] captionsMatch: ${captionsMatch}`);

      // captions 관련 내용 추출 시도
      const captionsIndex = html.indexOf('"captions"');
      if (captionsIndex >= 0) {
        const captionsContext = html.substring(
          captionsIndex - 50,
          captionsIndex + 200
        );
        console.log(`[captions 컨텍스트] ${captionsContext}`);
      } else {
        console.log('[captions 컨텍스트] "captions" 문자열을 찾을 수 없음');
      }

      // 마지막 시도: HTML에서 직접 텍스트 검색
      console.log("[최종 시도] 문자열 탐색으로 자막 찾기");
      const htmlText = striptags(html); // HTML 태그 제거
      console.log(`[HTML 텍스트 크기] ${htmlText.length} 자`);

      // 특수한 키워드 검색
      const specialPatterns = [
        "captionTracks",
        "playerCaptionsTracklistRenderer",
        "timedtext",
        "srv3",
      ];

      for (const pattern of specialPatterns) {
        const patternIndex = html.indexOf(pattern);
        if (patternIndex >= 0) {
          console.log(
            `[특수 패턴 발견] "${pattern}" 문자열 발견 (인덱스: ${patternIndex})`
          );
          const patternContext = html.substring(
            patternIndex - 100,
            patternIndex + 500
          );
          console.log(`[특수 패턴 컨텍스트] ${patternContext}`);
        } else {
          console.log(`[특수 패턴 미발견] "${pattern}" 문자열 없음`);
        }
      }

      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    return {
      success: true,
      data: {
        text,
        videoInfo,
      },
    };
  } catch (error: any) {
    console.error("[자막 추출 실패] 상세 에러:", error);

    // 네트워크 에러 추가 로깅
    if (error.isAxiosError) {
      console.error(`[네트워크 에러] ${error.message}`);
      console.error(`[요청 설정] ${JSON.stringify(error.config || {})}`);
      console.error(`[응답 상태] ${error.response?.status || "None"}`);
      console.error(
        `[응답 데이터] ${JSON.stringify(error.response?.data || {})}`
      );
    }

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

function extractVideoInfo(html: string, playerResponseData?: any) {
  console.log("[비디오 정보 추출] 시작");
  try {
    // playerResponseData가 있으면 먼저 활용
    if (playerResponseData && playerResponseData.videoDetails) {
      const { title, author, thumbnail } = playerResponseData.videoDetails;
      console.log("[비디오 정보 추출] playerResponse에서 정보 추출 성공");

      return {
        title: title || "Unknown Title",
        channelName: author || "Unknown Channel",
        thumbnailUrl: thumbnail?.thumbnails?.[0]?.url || "",
      };
    }

    // 기존 방식으로 추출
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

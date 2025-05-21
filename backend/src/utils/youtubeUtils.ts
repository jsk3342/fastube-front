import he from "he";
import axios from "axios";
import { find } from "lodash";
import striptags from "striptags";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// 스텔스 플러그인 활성화 (봇 감지 방지)
puppeteer.use(StealthPlugin());

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

/**
 * YouTube HTML 응답에서 봇 감지 여부를 확인하는 함수
 */
function checkForBotDetection(html: string): {
  detected: boolean;
  reason: string;
} {
  // 봇 감지 키워드 및 패턴 확인
  const botDetectionPatterns = [
    {
      pattern: /suspicious activity|unusual traffic|robot|captcha/i,
      reason: "의심스러운 활동 경고 문구",
    },
    {
      pattern: /https:\/\/www\.google\.com\/recaptcha\/api\.js/i,
      reason: "reCAPTCHA 스크립트 발견",
    },
    {
      pattern: /cf-browser-verification|cloudflare|challenge/i,
      reason: "Cloudflare 보안 검사",
    },
    { pattern: /sitekey/i, reason: "CAPTCHA 사이트키 발견" },
    { pattern: /id="captcha|class="captcha/i, reason: "CAPTCHA 요소 발견" },
    { pattern: /consent\.youtube\.com/i, reason: "동의 페이지 리디렉션" },
    { pattern: /sorry/i, reason: "Google 사과 페이지" },
  ];

  for (const { pattern, reason } of botDetectionPatterns) {
    if (pattern.test(html)) {
      return { detected: true, reason };
    }
  }

  // 정상적인 YouTube 비디오 페이지 콘텐츠가 있는지 확인
  const hasVideoPlayer =
    html.includes('id="player"') || html.includes('id="movie_player"');
  const hasTitleElement = html.includes("<title>") && html.includes("</title>");

  if (!hasVideoPlayer && !hasTitleElement) {
    return { detected: true, reason: "비디오 플레이어와 제목 요소 없음" };
  }

  return { detected: false, reason: "봇 감지 없음" };
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

    // 더 실제 브라우저와 유사한 User-Agent 사용
    const userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    console.log(`[요청 헤더] User-Agent: ${userAgent}`);

    const response = await axios.get(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": userAgent,
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Cache-Control": "max-age=0",
          "Sec-Ch-Ua":
            '"Chromium";v="122", "Google Chrome";v="122", "Not(A:Brand";v="24"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"macOS"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      }
    );
    console.log("[1단계] 자막 목록 응답 받음");
    console.log(`[응답 상태코드] ${response.status}`);
    console.log(`[응답 헤더] ${JSON.stringify(response.headers)}`);
    console.log(`[응답 데이터 크기] ${response.data?.length || 0} 바이트`);

    // HTML 전체를 로깅하지 않음
    const html = response.data;

    const botDetectionCheck = checkForBotDetection(html);
    console.log(`[봇 감지 확인 결과] ${JSON.stringify(botDetectionCheck)}`);

    if (botDetectionCheck.detected) {
      console.error("[오류] 봇 감지 발생: ", botDetectionCheck.reason);
      throw new Error(`Bot detection triggered: ${botDetectionCheck.reason}`);
    }

    // HTML 전체를 로깅하지 않고 일부만 로깅
    const htmlPreview =
      response.data.substring(0, 200) +
      "... (중략) ..." +
      response.data.substring(response.data.length - 200);
    console.log(`[응답 HTML 미리보기] ${htmlPreview}`);

    // 2. HTML 파싱 및 자막 데이터 검색
    console.log("[2단계] 자막 데이터 탐색 중...");

    // -------- 다양한 패턴으로 자막 정보 검색 --------

    // 패턴 1: ytInitialPlayerResponse
    let captionUrl: string | null = null;
    let finalVideoInfo: any = null;

    const playerRespMatch = html.match(
      /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/
    );
    if (playerRespMatch && playerRespMatch[1]) {
      try {
        const playerRespData = JSON.parse(playerRespMatch[1]);
        console.log("[패턴1] ytInitialPlayerResponse 구조 발견");

        // 전체 구조 로깅(디버깅용)
        console.log(
          "[패턴1] playerRespData 키 목록:",
          Object.keys(playerRespData)
        );

        if (playerRespData.captions) {
          console.log("[패턴1] captions 키 존재");
          console.log(
            "[패턴1] captions 구조:",
            JSON.stringify(playerRespData.captions).substring(0, 500)
          );

          const captionTracks =
            playerRespData.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captionTracks && captionTracks.length > 0) {
            console.log(`[패턴1] 자막 트랙 ${captionTracks.length}개 발견`);

            // 가능한 언어들 로깅
            const langs = captionTracks
              .map(
                (t: any) =>
                  `${t.languageCode}(${t.name?.simpleText || "Unknown"})`
              )
              .join(", ");
            console.log(`[패턴1] 사용 가능 언어: ${langs}`);

            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              captionTracks.find((t: any) => t.languageCode === language) ||
              captionTracks.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              console.log(`[패턴1] 자막 URL 찾음: ${captionUrl}`);
              finalVideoInfo = playerRespData.videoDetails
                ? {
                    title: playerRespData.videoDetails.title || "Unknown",
                    channelName:
                      playerRespData.videoDetails.author || "Unknown",
                    thumbnailUrl:
                      playerRespData.videoDetails.thumbnail?.thumbnails?.[0]
                        ?.url || "",
                  }
                : null;
            }
          } else {
            console.log("[패턴1] captionTracks 없음 또는 빈 배열");
            if (playerRespData.captions.playerCaptionsTracklistRenderer) {
              console.log(
                "[패턴1] playerCaptionsTracklistRenderer 구조:",
                JSON.stringify(
                  playerRespData.captions.playerCaptionsTracklistRenderer
                ).substring(0, 500)
              );
            }
          }
        } else {
          console.log("[패턴1] captions 키 없음");

          // videoDetails 확인
          if (playerRespData.videoDetails) {
            console.log(
              "[패턴1] videoDetails 발견:",
              JSON.stringify(playerRespData.videoDetails).substring(0, 500)
            );
          }

          // 다른 구조 확인 (Translate API YouTube가 다양한 형태로 자막 정보를 제공할 수 있음)
          if (playerRespData.playerConfig) {
            console.log("[패턴1] playerConfig 발견");

            if (playerRespData.playerConfig.captions) {
              console.log(
                "[패턴1] playerConfig.captions 발견:",
                JSON.stringify(playerRespData.playerConfig.captions).substring(
                  0,
                  500
                )
              );
            }
          }
        }
      } catch (e) {
        console.log(`[패턴1] 파싱 실패: ${e}`);
      }
    } else {
      console.log("[패턴1] ytInitialPlayerResponse 구조 찾지 못함");
    }

    // 패턴 2: ytInitialData 시도
    if (!captionUrl) {
      console.log("[패턴2] ytInitialData 시도 중...");
      const initialData = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
      if (initialData && initialData[1]) {
        console.log("[패턴2] ytInitialData 찾음");
        try {
          const initialJson = JSON.parse(initialData[1]);
          console.log(
            "[패턴2] ytInitialData 키 목록:",
            Object.keys(initialJson)
          );

          // 여러 가능한 경로 확인
          if (initialJson.playerOverlays) {
            console.log("[패턴2] playerOverlays 발견");
            const playerOverlayData = initialJson.playerOverlays;
            console.log(
              "[패턴2] playerOverlays 키 목록:",
              Object.keys(playerOverlayData)
            );
          }

          if (initialJson.contents) {
            console.log("[패턴2] contents 발견");
            // contents의 깊은 구조를 탐색해봅니다
            const contentsStr = JSON.stringify(initialJson.contents).substring(
              0,
              1000
            );
            console.log("[패턴2] contents 일부:", contentsStr);

            // captions 문자열 검색
            if (
              contentsStr.includes("caption") ||
              contentsStr.includes("subtitle")
            ) {
              console.log(
                "[패턴2] contents에서 caption/subtitle 관련 문자열 발견"
              );
            }
          }
        } catch (e) {
          console.log(`[패턴2] 파싱 실패: ${e}`);
        }
      } else {
        console.log("[패턴2] ytInitialData 구조 찾지 못함");
      }
    }

    // 패턴 3: 원시 정규식 패턴
    if (!captionUrl) {
      console.log("[패턴3] 정규식으로 자막 정보 직접 검색");

      // "captions":{"playerCaptionsTracklistRenderer" 패턴 시도
      const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
      if (captionsMatch && captionsMatch[1]) {
        console.log(
          '[패턴3] "captions" 패턴 발견:',
          captionsMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도 (객체가 완전하지 않을 수 있음)
          const captionsJson = JSON.parse(captionsMatch[1]);
          console.log("[패턴3] 파싱 성공, 키 목록:", Object.keys(captionsJson));
        } catch (e: any) {
          console.log(`[패턴3] captions JSON 파싱 실패: ${e.message}`);
        }
      } else {
        console.log('[패턴3] "captions" 패턴 찾지 못함');
      }

      // "captionTracks" 패턴 시도
      const captionTracksMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (captionTracksMatch && captionTracksMatch[1]) {
        console.log(
          '[패턴3] "captionTracks" 패턴 발견:',
          captionTracksMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도
          const tracksJson = JSON.parse(captionTracksMatch[1]);
          console.log("[패턴3] 자막 트랙 개수:", tracksJson.length);

          // 자막 추출 시도
          if (tracksJson.length > 0) {
            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              tracksJson.find((t: any) => t.languageCode === language) ||
              tracksJson.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              console.log(`[패턴3] 자막 URL 찾음: ${captionUrl}`);
            }
          }
        } catch (e: any) {
          console.log(`[패턴3] captionTracks JSON 파싱 실패: ${e.message}`);
        }
      } else {
        console.log('[패턴3] "captionTracks" 패턴 찾지 못함');
      }

      // "playerCaptionsTracklistRenderer" 패턴 시도
      const tracklistMatch = html.match(
        /"playerCaptionsTracklistRenderer":\s*({[^}]+})/
      );
      if (tracklistMatch && tracklistMatch[1]) {
        console.log(
          '[패턴3] "playerCaptionsTracklistRenderer" 패턴 발견:',
          tracklistMatch[1].substring(0, 500)
        );
      } else {
        console.log('[패턴3] "playerCaptionsTracklistRenderer" 패턴 찾지 못함');
      }

      // 전체 HTML에서 자막 관련 키워드 검색 (디버깅용)
      const hasCaptionKeyword = html.includes("captionTracks");
      const hasPlayerCaptionsKeyword = html.includes(
        "playerCaptionsTracklistRenderer"
      );
      console.log(
        '[패턴3] HTML에 "captionTracks" 포함 여부:',
        hasCaptionKeyword
      );
      console.log(
        '[패턴3] HTML에 "playerCaptionsTracklistRenderer" 포함 여부:',
        hasPlayerCaptionsKeyword
      );
    }

    // 패턴 4: 특수 키워드 검색
    if (!captionUrl) {
      const patterns = ["timedtext", "srv3", "caption_tracks"];
      for (const pattern of patterns) {
        const idx = html.indexOf(pattern);
        if (idx >= 0) {
          console.log(`[패턴4] 키워드 '${pattern}' 발견 (인덱스: ${idx})`);
          // 키워드 주변 컨텍스트 출력
          const context = html.substring(
            Math.max(0, idx - 100),
            Math.min(html.length, idx + 500)
          );
          console.log(`[패턴4] 컨텍스트: ${context}`);

          // 'timedtext'가 포함된 URL 찾기 시도
          const urlMatches = context.match(
            /(https?:\/\/[^"'\s,}]+timedtext[^"'\s,}]+)/
          );
          if (urlMatches && urlMatches[1]) {
            captionUrl = urlMatches[1];
            console.log(`[패턴4] 자막 URL 찾음: ${captionUrl}`);
            break;
          }
        }
      }
    }

    // 자막 URL을 찾지 못했을 경우
    if (!captionUrl) {
      console.log("[모든 패턴] 자막 URL을 찾지 못했습니다");
      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    // 3. 자막 데이터 가져오기
    console.log("[3단계] 자막 데이터 다운로드 중...");
    console.log(`[자막 요청 URL] ${captionUrl}`);

    try {
      const captionResponse = await axios.get(captionUrl);
      console.log("[3단계] 자막 데이터 다운로드 완료");
      console.log(`[자막 응답 상태코드] ${captionResponse.status}`);
      console.log(
        `[자막 응답 데이터 크기] ${captionResponse.data?.length || 0} 바이트`
      );
      console.log(
        `[자막 응답 데이터 미리보기] ${captionResponse.data.substring(0, 500)}...`
      );

      // 4. 자막 파싱
      console.log("[4단계] 자막 파싱 중...");
      const subtitles = parseSubtitles(captionResponse.data);
      console.log(`[4단계] 파싱된 자막 수: ${subtitles.length}`);

      // 일부 자막 샘플 출력
      if (subtitles.length > 0) {
        console.log(`[4단계] 첫 번째 자막: ${JSON.stringify(subtitles[0])}`);
        console.log(
          `[4단계] 마지막 자막: ${JSON.stringify(subtitles[subtitles.length - 1])}`
        );
      }

      // 5. 자막 텍스트 추출
      console.log("[5단계] 자막 텍스트 추출 중...");
      const textContent = subtitles.map((subtitle) => subtitle.text).join("\n");
      console.log(`[5단계] 자막 텍스트 길이: ${textContent.length} 자`);
      console.log(
        `[5단계] 자막 텍스트 샘플: ${textContent.substring(0, 200)}...`
      );

      // 6. 비디오 정보 추출 (이미 추출되었을 수도 있음)
      console.log("[6단계] 비디오 정보 추출 중...");
      const videoInfoResult = finalVideoInfo || extractVideoInfo(html);
      console.log(
        `[6단계] 비디오 정보 추출 완료: ${JSON.stringify(videoInfoResult)}`
      );

      // 7. 결과 반환
      return {
        success: true,
        data: {
          text: textContent,
          videoInfo: videoInfoResult,
        },
      };
    } catch (captionError: any) {
      console.error(`[자막 다운로드 실패] ${captionError.message}`);
      console.error(
        `[자막 에러 상세] ${JSON.stringify(captionError.response || {})}`
      );
      throw new Error(
        `Failed to download caption data: ${captionError.message}`
      );
    }
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

export async function getSubtitlesFromYouTube(
  videoId: string,
  language = "en"
): Promise<SubtitleResponse> {
  try {
    console.log(`YouTube 영상 ID: ${videoId}, 언어: ${language} 처리 시작`);

    // YouTube 영상 페이지 요청
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36";

    const response = await axios.get(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": userAgent,
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    console.log(`YouTube 응답 상태: ${response.status} ${response.statusText}`);
    console.log(`응답 헤더: ${JSON.stringify(response.headers)}`);

    const html = response.data;
    if (!html) {
      console.log("YouTube에서 HTML을 가져오지 못했습니다");
      throw new Error("YouTube에서 HTML을 가져오지 못했습니다");
    }

    console.log(`YouTube HTML 응답 크기: ${html.length} 바이트`);

    // -------- 다양한 패턴으로 자막 정보 검색 --------
    // 자막 URL 추출 시도
    let captionUrl: string | null = null;
    let finalVideoInfo: any = null;

    // 패턴 1: ytInitialPlayerResponse
    const playerRespMatch = html.match(
      /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/
    );
    if (playerRespMatch && playerRespMatch[1]) {
      try {
        const playerRespData = JSON.parse(playerRespMatch[1]);
        console.log("[패턴1] ytInitialPlayerResponse 구조 발견");

        // 전체 구조 로깅(디버깅용)
        console.log(
          "[패턴1] playerRespData 키 목록:",
          Object.keys(playerRespData)
        );

        if (playerRespData.captions) {
          console.log("[패턴1] captions 키 존재");
          console.log(
            "[패턴1] captions 구조:",
            JSON.stringify(playerRespData.captions).substring(0, 500)
          );

          const captionTracks =
            playerRespData.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captionTracks && captionTracks.length > 0) {
            console.log(`[패턴1] 자막 트랙 ${captionTracks.length}개 발견`);

            // 가능한 언어들 로깅
            const langs = captionTracks
              .map(
                (t: any) =>
                  `${t.languageCode}(${t.name?.simpleText || "Unknown"})`
              )
              .join(", ");
            console.log(`[패턴1] 사용 가능 언어: ${langs}`);

            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              captionTracks.find((t: any) => t.languageCode === language) ||
              captionTracks.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              console.log(`[패턴1] 자막 URL 찾음: ${captionUrl}`);
              finalVideoInfo = playerRespData.videoDetails
                ? {
                    title: playerRespData.videoDetails.title || "Unknown",
                    channelName:
                      playerRespData.videoDetails.author || "Unknown",
                    thumbnailUrl:
                      playerRespData.videoDetails.thumbnail?.thumbnails?.[0]
                        ?.url || "",
                  }
                : null;
            }
          } else {
            console.log("[패턴1] captionTracks 없음 또는 빈 배열");
            if (playerRespData.captions.playerCaptionsTracklistRenderer) {
              console.log(
                "[패턴1] playerCaptionsTracklistRenderer 구조:",
                JSON.stringify(
                  playerRespData.captions.playerCaptionsTracklistRenderer
                ).substring(0, 500)
              );
            }
          }
        } else {
          console.log("[패턴1] captions 키 없음");

          // videoDetails 확인
          if (playerRespData.videoDetails) {
            console.log(
              "[패턴1] videoDetails 발견:",
              JSON.stringify(playerRespData.videoDetails).substring(0, 500)
            );
          }

          // 다른 구조 확인 (Translate API YouTube가 다양한 형태로 자막 정보를 제공할 수 있음)
          if (playerRespData.playerConfig) {
            console.log("[패턴1] playerConfig 발견");

            if (playerRespData.playerConfig.captions) {
              console.log(
                "[패턴1] playerConfig.captions 발견:",
                JSON.stringify(playerRespData.playerConfig.captions).substring(
                  0,
                  500
                )
              );
            }
          }
        }
      } catch (e) {
        console.log(`[패턴1] 파싱 실패: ${e}`);
      }
    } else {
      console.log("[패턴1] ytInitialPlayerResponse 구조 찾지 못함");
    }

    // 패턴 2: ytInitialData 시도
    if (!captionUrl) {
      console.log("[패턴2] ytInitialData 시도 중...");
      const initialData = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
      if (initialData && initialData[1]) {
        console.log("[패턴2] ytInitialData 찾음");
        try {
          const initialJson = JSON.parse(initialData[1]);
          console.log(
            "[패턴2] ytInitialData 키 목록:",
            Object.keys(initialJson)
          );

          // 여러 가능한 경로 확인
          if (initialJson.playerOverlays) {
            console.log("[패턴2] playerOverlays 발견");
            const playerOverlayData = initialJson.playerOverlays;
            console.log(
              "[패턴2] playerOverlays 키 목록:",
              Object.keys(playerOverlayData)
            );
          }

          if (initialJson.contents) {
            console.log("[패턴2] contents 발견");
            // contents의 깊은 구조를 탐색해봅니다
            const contentsStr = JSON.stringify(initialJson.contents).substring(
              0,
              1000
            );
            console.log("[패턴2] contents 일부:", contentsStr);

            // captions 문자열 검색
            if (
              contentsStr.includes("caption") ||
              contentsStr.includes("subtitle")
            ) {
              console.log(
                "[패턴2] contents에서 caption/subtitle 관련 문자열 발견"
              );
            }
          }
        } catch (e) {
          console.log(`[패턴2] 파싱 실패: ${e}`);
        }
      } else {
        console.log("[패턴2] ytInitialData 구조 찾지 못함");
      }
    }

    // 패턴 3: 원시 정규식 패턴
    if (!captionUrl) {
      console.log("[패턴3] 정규식으로 자막 정보 직접 검색");

      // "captions":{"playerCaptionsTracklistRenderer" 패턴 시도
      const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
      if (captionsMatch && captionsMatch[1]) {
        console.log(
          '[패턴3] "captions" 패턴 발견:',
          captionsMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도 (객체가 완전하지 않을 수 있음)
          const captionsJson = JSON.parse(captionsMatch[1]);
          console.log("[패턴3] 파싱 성공, 키 목록:", Object.keys(captionsJson));
        } catch (e: any) {
          console.log(`[패턴3] captions JSON 파싱 실패: ${e.message}`);
        }
      } else {
        console.log('[패턴3] "captions" 패턴 찾지 못함');
      }

      // "captionTracks" 패턴 시도
      const captionTracksMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (captionTracksMatch && captionTracksMatch[1]) {
        console.log(
          '[패턴3] "captionTracks" 패턴 발견:',
          captionTracksMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도
          const tracksJson = JSON.parse(captionTracksMatch[1]);
          console.log("[패턴3] 자막 트랙 개수:", tracksJson.length);

          // 자막 추출 시도
          if (tracksJson.length > 0) {
            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              tracksJson.find((t: any) => t.languageCode === language) ||
              tracksJson.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              console.log(`[패턴3] 자막 URL 찾음: ${captionUrl}`);
            }
          }
        } catch (e: any) {
          console.log(`[패턴3] captionTracks JSON 파싱 실패: ${e.message}`);
        }
      } else {
        console.log('[패턴3] "captionTracks" 패턴 찾지 못함');
      }

      // "playerCaptionsTracklistRenderer" 패턴 시도
      const tracklistMatch = html.match(
        /"playerCaptionsTracklistRenderer":\s*({[^}]+})/
      );
      if (tracklistMatch && tracklistMatch[1]) {
        console.log(
          '[패턴3] "playerCaptionsTracklistRenderer" 패턴 발견:',
          tracklistMatch[1].substring(0, 500)
        );
      } else {
        console.log('[패턴3] "playerCaptionsTracklistRenderer" 패턴 찾지 못함');
      }

      // 전체 HTML에서 자막 관련 키워드 검색 (디버깅용)
      const hasCaptionKeyword = html.includes("captionTracks");
      const hasPlayerCaptionsKeyword = html.includes(
        "playerCaptionsTracklistRenderer"
      );
      console.log(
        '[패턴3] HTML에 "captionTracks" 포함 여부:',
        hasCaptionKeyword
      );
      console.log(
        '[패턴3] HTML에 "playerCaptionsTracklistRenderer" 포함 여부:',
        hasPlayerCaptionsKeyword
      );
    }

    // 패턴 4: 특수 키워드 검색
    if (!captionUrl) {
      const patterns = ["timedtext", "srv3", "caption_tracks"];
      for (const pattern of patterns) {
        const idx = html.indexOf(pattern);
        if (idx >= 0) {
          console.log(`[패턴4] 키워드 '${pattern}' 발견 (인덱스: ${idx})`);
          // 키워드 주변 컨텍스트 출력
          const context = html.substring(
            Math.max(0, idx - 100),
            Math.min(html.length, idx + 500)
          );
          console.log(`[패턴4] 컨텍스트: ${context}`);

          // 'timedtext'가 포함된 URL 찾기 시도
          const urlMatches = context.match(
            /(https?:\/\/[^"'\s,}]+timedtext[^"'\s,}]+)/
          );
          if (urlMatches && urlMatches[1]) {
            captionUrl = urlMatches[1];
            console.log(`[패턴4] 자막 URL 찾음: ${captionUrl}`);
            break;
          }
        }
      }
    }

    // 자막 URL을 찾지 못했을 경우
    if (!captionUrl) {
      console.log("[모든 패턴] 자막 URL을 찾지 못했습니다");
      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    // 3. 자막 데이터 가져오기
    console.log("[3단계] 자막 데이터 다운로드 중...");
    console.log(`[자막 요청 URL] ${captionUrl}`);

    try {
      const captionResponse = await axios.get(captionUrl);
      console.log("[3단계] 자막 데이터 다운로드 완료");
      console.log(`[자막 응답 상태코드] ${captionResponse.status}`);
      console.log(
        `[자막 응답 데이터 크기] ${captionResponse.data?.length || 0} 바이트`
      );
      console.log(
        `[자막 응답 데이터 미리보기] ${captionResponse.data.substring(0, 500)}...`
      );

      // 4. 자막 파싱
      console.log("[4단계] 자막 파싱 중...");
      const subtitles = parseSubtitles(captionResponse.data);
      console.log(`[4단계] 파싱된 자막 수: ${subtitles.length}`);

      // 일부 자막 샘플 출력
      if (subtitles.length > 0) {
        console.log(`[4단계] 첫 번째 자막: ${JSON.stringify(subtitles[0])}`);
        console.log(
          `[4단계] 마지막 자막: ${JSON.stringify(subtitles[subtitles.length - 1])}`
        );
      }

      // 5. 자막 텍스트 추출
      console.log("[5단계] 자막 텍스트 추출 중...");
      const textContent = subtitles.map((subtitle) => subtitle.text).join("\n");
      console.log(`[5단계] 자막 텍스트 길이: ${textContent.length} 자`);
      console.log(
        `[5단계] 자막 텍스트 샘플: ${textContent.substring(0, 100)}...`
      );

      // 6. 비디오 정보 추출 (이미 추출되었을 수도 있음)
      console.log("[6단계] 비디오 정보 추출 중...");
      const videoInfoResult = finalVideoInfo || extractVideoInfo(html);
      console.log(
        `[6단계] 비디오 정보 추출 완료: ${JSON.stringify(videoInfoResult)}`
      );

      // 7. 결과 반환
      return {
        success: true,
        data: {
          text: textContent,
          videoInfo: videoInfoResult,
        },
      };
    } catch (captionError: any) {
      console.error(`[자막 다운로드 실패] ${captionError.message}`);
      console.error(
        `[자막 에러 상세] ${JSON.stringify(captionError.response || {})}`
      );
      throw new Error(
        `Failed to download caption data: ${captionError.message}`
      );
    }
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

/**
 * Puppeteer를 사용하여 YouTube 자막 가져오기 (봇 감지 우회)
 */
export async function getSubtitlesWithPuppeteer(
  videoId: string,
  language: string = "ko"
): Promise<SubtitleResponse> {
  console.log(`[자막 추출 시작] 비디오 ID: ${videoId}, 언어: ${language}`);

  // 브라우저 시작 (더 많은 옵션은 필요에 따라 추가)
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920x1080",
    ],
  });

  try {
    const page = await browser.newPage();

    // 사용자 에이전트 설정 (실제 브라우저처럼 보이기)
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // 언어 설정
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    // 웹사이트 방문 전 쿠키 수락 페이지 우회 설정
    await page.setCookie({
      name: "CONSENT",
      value: "YES+cb",
      domain: ".youtube.com",
      path: "/",
    });

    // 브라우저 지문 위장
    await page.evaluateOnNewDocument(() => {
      // 웹드라이버 감지 방지
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // 플러그인 감지 방지
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          {
            0: {
              type: "application/x-google-chrome-pdf",
              suffixes: "pdf",
              description: "Portable Document Format",
              enabledPlugin: Plugin,
            },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin",
          },
          {
            0: {
              type: "application/pdf",
              suffixes: "pdf",
              description: "",
              enabledPlugin: Plugin,
            },
            description: "",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
            length: 1,
            name: "Chrome PDF Viewer",
          },
          {
            0: {
              type: "application/x-nacl",
              suffixes: "",
              description: "Native Client Executable",
              enabledPlugin: Plugin,
            },
            1: {
              type: "application/x-pnacl",
              suffixes: "",
              description: "Portable Native Client Executable",
              enabledPlugin: Plugin,
            },
            description: "",
            filename: "internal-nacl-plugin",
            length: 2,
            name: "Native Client",
          },
        ],
      });

      // 언어 및 플랫폼 설정
      Object.defineProperty(navigator, "language", {
        get: () => "ko-KR",
      });
      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
      });
    });

    // 페이지 로드 타임아웃 설정
    await page.setDefaultNavigationTimeout(30000);

    // YouTube 비디오 페이지 방문
    console.log(
      `[Puppeteer] YouTube 페이지 방문: https://www.youtube.com/watch?v=${videoId}`
    );
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: "networkidle2",
    });

    // 페이지 로드 후 약간 기다림 (YouTube가 자막 정보를 로드할 시간을 줌)
    // waitForTimeout 대신 setTimeout과 Promise 사용
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 자막 버튼 클릭 전에 비디오 플레이어 로드 확인
    await page
      .waitForSelector("#movie_player", { timeout: 10000 })
      .catch((err) => {
        console.log("[Puppeteer] 비디오 플레이어 로드 실패:", err.message);
      });

    console.log("[Puppeteer] 페이지 로드 완료, 자막 데이터 추출 시작");

    // 페이지 HTML 가져오기
    const html = await page.content();

    // 봇 감지 확인
    const botDetection = checkForBotDetection(html);
    if (botDetection.detected) {
      throw new Error(`봇 감지됨: ${botDetection.reason}`);
    }

    // 자막 URL 추출 - ytInitialPlayerResponse에서 탐색
    const captionData = await page.evaluate((lang: string) => {
      try {
        // 타입 확장
        interface Window {
          ytInitialPlayerResponse?: any;
        }

        // 두 가지 가능한 변수 위치 확인
        let ytInitialPlayerResponse: any = null;

        // 첫 번째 방법: 직접 window 객체에서 확인
        if ((window as any).ytInitialPlayerResponse) {
          ytInitialPlayerResponse = (window as any).ytInitialPlayerResponse;
        }
        // 두 번째 방법: HTML에서 정규식으로 검색
        else {
          const scriptTags = document.querySelectorAll("script");
          for (const script of Array.from(scriptTags)) {
            const text = script.textContent || "";
            if (text.includes("ytInitialPlayerResponse")) {
              const match = text.match(
                /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/
              );
              if (match && match[1]) {
                ytInitialPlayerResponse = JSON.parse(match[1]);
                break;
              }
            }
          }
        }

        if (!ytInitialPlayerResponse) {
          return { error: "ytInitialPlayerResponse를 찾을 수 없음" };
        }

        // 자막 트랙 목록 확인
        if (
          !ytInitialPlayerResponse.captions ||
          !ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer ||
          !ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer
            .captionTracks
        ) {
          return { error: "자막 목록을 찾을 수 없음" };
        }

        const captionTracks =
          ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer
            .captionTracks;

        // 사용 가능한 자막 언어 목록 수집
        const availableLanguages = captionTracks.map((track: any) => {
          return {
            code: track.languageCode,
            name:
              track.name?.simpleText ||
              track.name?.runs?.[0]?.text ||
              track.languageCode,
          };
        });

        // 요청한 언어 또는 영어 자막 찾기
        const targetTrack =
          captionTracks.find((t: any) => t.languageCode === lang) ||
          captionTracks.find((t: any) => t.languageCode === "en");

        if (!targetTrack) {
          return {
            error: "요청한 언어의 자막을 찾을 수 없음",
            availableLanguages,
          };
        }

        // 비디오 정보 추출
        const videoInfo = ytInitialPlayerResponse.videoDetails
          ? {
              title: ytInitialPlayerResponse.videoDetails.title || "Unknown",
              channelName:
                ytInitialPlayerResponse.videoDetails.author || "Unknown",
              thumbnailUrl:
                ytInitialPlayerResponse.videoDetails.thumbnail?.thumbnails?.[0]
                  ?.url || "",
            }
          : undefined;

        return {
          captionUrl: targetTrack.baseUrl,
          videoInfo,
        };
      } catch (error) {
        return { error: `자막 데이터 추출 중 오류: ${error}` };
      }
    }, language);

    // 자막 URL을 찾지 못한 경우
    if (captionData.error) {
      console.log(`[Puppeteer] 자막 데이터 추출 실패: ${captionData.error}`);
      throw new Error(captionData.error);
    }

    // 자막 데이터 다운로드
    console.log(`[Puppeteer] 자막 URL 발견: ${captionData.captionUrl}`);
    const captionResponse = await axios.get(captionData.captionUrl);

    // 자막 파싱
    const subtitles = parseSubtitles(captionResponse.data);
    console.log(`[Puppeteer] 파싱된 자막 수: ${subtitles.length}`);

    // 텍스트 추출
    const textContent = subtitles.map((subtitle) => subtitle.text).join("\n");

    // 결과 반환
    return {
      success: true,
      data: {
        text: textContent,
        videoInfo: captionData.videoInfo,
      },
    };
  } catch (error: any) {
    console.error(`[Puppeteer] 자막 추출 실패: ${error.message}`);
    throw error;
  } finally {
    // 브라우저 종료
    await browser.close();
    console.log("[Puppeteer] 브라우저 종료");
  }
}

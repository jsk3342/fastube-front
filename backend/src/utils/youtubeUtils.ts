import he from "he";
import axios from "axios";
import { find } from "lodash";
import striptags from "striptags";
import fs from "fs";
import path from "path";

// 로그 디렉토리 생성 함수
function ensureLogDirectory() {
  const logDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

// HTML 로그 저장 함수
function saveHtmlLog(videoId: string, html: string) {
  try {
    const logDir = ensureLogDirectory();
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const logPath = path.join(
      logDir,
      `youtube_html_${videoId}_${timestamp}.html`
    );
    fs.writeFileSync(logPath, html);
    console.log(`[로그 저장] HTML 데이터가 저장되었습니다: ${logPath}`);

    // 요약 정보도 함께 저장
    const logSummaryPath = path.join(
      logDir,
      `youtube_summary_${videoId}_${timestamp}.txt`
    );
    const summary = `비디오 ID: ${videoId}\n시간: ${new Date().toISOString()}\nHTML 크기: ${html.length} 바이트\n`;
    fs.writeFileSync(logSummaryPath, summary);
    console.log(`[로그 저장] 요약 정보가 저장되었습니다: ${logSummaryPath}`);

    return logPath;
  } catch (error) {
    console.error("[로그 저장 실패]", error);
    return null;
  }
}

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
    // 로그 파일 경로 및 시작 시간 기록
    const logDir = ensureLogDirectory();
    const startTime = new Date();
    const logSummaryPath = path.join(
      logDir,
      `subtitle_extraction_${videoId}_${startTime.toISOString().replace(/:/g, "-")}.log`
    );
    let logMessages = [
      `자막 추출 시작: ${startTime.toISOString()}`,
      `비디오 ID: ${videoId}`,
      `요청 언어: ${language}`,
      `비디오 URL: https://www.youtube.com/watch?v=${videoId}`,
      `-----------------------------------`,
    ];
    fs.writeFileSync(logSummaryPath, logMessages.join("\n") + "\n");
    console.log(`[로그 초기화] 자막 추출 로그 파일 생성: ${logSummaryPath}`);

    // 로그 추가 함수
    const appendLog = (message: string) => {
      logMessages.push(`${new Date().toISOString()}: ${message}`);
      fs.appendFileSync(
        logSummaryPath,
        `${new Date().toISOString()}: ${message}\n`
      );
    };

    // 여러 인자를 처리할 수 있는 로그 함수
    const appendLogWithData = (message: string, data: any) => {
      const formattedMessage = `${message} ${typeof data === "object" ? JSON.stringify(data) : data}`;
      logMessages.push(`${new Date().toISOString()}: ${formattedMessage}`);
      fs.appendFileSync(
        logSummaryPath,
        `${new Date().toISOString()}: ${formattedMessage}\n`
      );
    };

    // 1. 자막 목록 가져오기
    appendLog("[1단계] 자막 목록 요청 중...");
    appendLog(`[요청 URL] https://www.youtube.com/watch?v=${videoId}`);
    appendLog(
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
    appendLog("[1단계] 자막 목록 응답 받음");
    appendLog(`[응답 상태코드] ${response.status}`);
    appendLog(`[응답 헤더] ${JSON.stringify(response.headers)}`);
    appendLog(`[응답 데이터 크기] ${response.data?.length || 0} 바이트`);

    // HTML 전체를 별도 파일로 저장하고 로그 출력
    const html = response.data;
    appendLog("[전체 HTML] 시작 =============================================");

    // HTML 데이터를 로컬 파일에 저장
    saveHtmlLog(videoId, html);

    appendLog(html);
    appendLog("[전체 HTML] 끝 ===============================================");

    // HTML 전체를 로깅하면 너무 많으니 일부만 로깅
    const htmlPreview =
      response.data.substring(0, 500) +
      "... (중략) ..." +
      response.data.substring(response.data.length - 500);
    appendLog(`[응답 HTML 미리보기] ${htmlPreview}`);

    // 2. HTML 파싱 및 자막 데이터 검색
    appendLog("[2단계] 자막 데이터 탐색 중...");

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
        appendLog("[패턴1] ytInitialPlayerResponse 구조 발견");

        // 전체 구조 로깅(디버깅용)
        appendLogWithData(
          "[패턴1] playerRespData 키 목록:",
          Object.keys(playerRespData)
        );

        if (playerRespData.captions) {
          appendLog("[패턴1] captions 키 존재");
          appendLogWithData(
            "[패턴1] captions 구조:",
            JSON.stringify(playerRespData.captions).substring(0, 500)
          );

          const captionTracks =
            playerRespData.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captionTracks && captionTracks.length > 0) {
            appendLogWithData("[패턴1] 자막 트랙 개수:", captionTracks.length);

            // 가능한 언어들 로깅
            const langs = captionTracks
              .map(
                (t: any) =>
                  `${t.languageCode}(${t.name?.simpleText || "Unknown"})`
              )
              .join(", ");
            appendLogWithData("[패턴1] 사용 가능 언어:", langs);

            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              captionTracks.find((t: any) => t.languageCode === language) ||
              captionTracks.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              appendLogWithData("[패턴1] 자막 URL 찾음:", captionUrl);
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
            appendLog("[패턴1] captionTracks 없음 또는 빈 배열");
            if (playerRespData.captions.playerCaptionsTracklistRenderer) {
              appendLog(
                "[패턴1] playerCaptionsTracklistRenderer 구조:",
                JSON.stringify(
                  playerRespData.captions.playerCaptionsTracklistRenderer
                ).substring(0, 500)
              );
            }
          }
        } else {
          appendLog("[패턴1] captions 키 없음");

          // videoDetails 확인
          if (playerRespData.videoDetails) {
            appendLogWithData(
              "[패턴1] videoDetails 발견:",
              JSON.stringify(playerRespData.videoDetails).substring(0, 500)
            );
          }

          // 다른 구조 확인 (Translate API YouTube가 다양한 형태로 자막 정보를 제공할 수 있음)
          if (playerRespData.playerConfig) {
            appendLog("[패턴1] playerConfig 발견");

            if (playerRespData.playerConfig.captions) {
              appendLog(
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
        appendLog(`[패턴1] 파싱 실패: ${e}`);
      }
    } else {
      appendLog("[패턴1] ytInitialPlayerResponse 구조 찾지 못함");
    }

    // 패턴 2: ytInitialData 시도
    if (!captionUrl) {
      appendLog("[패턴2] ytInitialData 시도 중...");
      const initialData = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
      if (initialData && initialData[1]) {
        appendLog("[패턴2] ytInitialData 찾음");
        try {
          const initialJson = JSON.parse(initialData[1]);
          appendLogWithData(
            "[패턴2] ytInitialData 키 목록:",
            Object.keys(initialJson)
          );

          // 여러 가능한 경로 확인
          if (initialJson.playerOverlays) {
            appendLog("[패턴2] playerOverlays 발견");
            const playerOverlayData = initialJson.playerOverlays;
            appendLogWithData(
              "[패턴2] playerOverlays 키 목록:",
              Object.keys(playerOverlayData)
            );
          }

          if (initialJson.contents) {
            appendLog("[패턴2] contents 발견");
            // contents의 깊은 구조를 탐색해봅니다
            const contentsStr = JSON.stringify(initialJson.contents).substring(
              0,
              1000
            );
            appendLogWithData("[패턴2] contents 일부:", contentsStr);

            // captions 문자열 검색
            if (
              contentsStr.includes("caption") ||
              contentsStr.includes("subtitle")
            ) {
              appendLog(
                "[패턴2] contents에서 caption/subtitle 관련 문자열 발견"
              );
            }
          }
        } catch (e) {
          appendLog(`[패턴2] 파싱 실패: ${e}`);
        }
      } else {
        appendLog("[패턴2] ytInitialData 구조 찾지 못함");
      }
    }

    // 패턴 3: 원시 정규식 패턴
    if (!captionUrl) {
      appendLog("[패턴3] 정규식으로 자막 정보 직접 검색");

      // "captions":{"playerCaptionsTracklistRenderer" 패턴 시도
      const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
      if (captionsMatch && captionsMatch[1]) {
        appendLogWithData(
          '[패턴3] "captions" 패턴 발견:',
          captionsMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도 (객체가 완전하지 않을 수 있음)
          const captionsJson = JSON.parse(captionsMatch[1]);
          appendLogWithData(
            "[패턴3] 파싱 성공, 키 목록:",
            Object.keys(captionsJson)
          );
        } catch (e: any) {
          appendLog(`[패턴3] captions JSON 파싱 실패: ${e.message}`);
        }
      } else {
        appendLog('[패턴3] "captions" 패턴 찾지 못함');
      }

      // "captionTracks" 패턴 시도
      const captionTracksMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (captionTracksMatch && captionTracksMatch[1]) {
        appendLogWithData(
          '[패턴3] "captionTracks" 패턴 발견:',
          captionTracksMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도
          const tracksJson = JSON.parse(captionTracksMatch[1]);
          appendLogWithData("[패턴3] 자막 트랙 개수:", tracksJson.length);

          // 자막 추출 시도
          if (tracksJson.length > 0) {
            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              tracksJson.find((t: any) => t.languageCode === language) ||
              tracksJson.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              appendLogWithData("[패턴3] 자막 URL 찾음:", captionUrl);
            }
          }
        } catch (e: any) {
          appendLog(`[패턴3] captionTracks JSON 파싱 실패: ${e.message}`);
        }
      } else {
        appendLog('[패턴3] "captionTracks" 패턴 찾지 못함');
      }

      // "playerCaptionsTracklistRenderer" 패턴 시도
      const tracklistMatch = html.match(
        /"playerCaptionsTracklistRenderer":\s*({[^}]+})/
      );
      if (tracklistMatch && tracklistMatch[1]) {
        appendLogWithData(
          '[패턴3] "playerCaptionsTracklistRenderer" 패턴 발견:',
          tracklistMatch[1].substring(0, 500)
        );
      } else {
        appendLog('[패턴3] "playerCaptionsTracklistRenderer" 패턴 찾지 못함');
      }

      // 전체 HTML에서 자막 관련 키워드 검색 (디버깅용)
      const hasCaptionKeyword = html.includes("captionTracks");
      const hasPlayerCaptionsKeyword = html.includes(
        "playerCaptionsTracklistRenderer"
      );
      appendLogWithData(
        '[패턴3] HTML에 "captionTracks" 포함 여부:',
        hasCaptionKeyword
      );
      appendLogWithData(
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
          appendLogWithData(
            `[패턴4] 키워드 '${pattern}' 발견 (인덱스: ${idx})`,
            idx
          );
          // 키워드 주변 컨텍스트 출력
          const context = html.substring(
            Math.max(0, idx - 100),
            Math.min(html.length, idx + 500)
          );
          appendLogWithData("[패턴4] 컨텍스트:", context);

          // 'timedtext'가 포함된 URL 찾기 시도
          const urlMatches = context.match(
            /(https?:\/\/[^"'\s,}]+timedtext[^"'\s,}]+)/
          );
          if (urlMatches && urlMatches[1]) {
            captionUrl = urlMatches[1];
            appendLogWithData("[패턴4] 자막 URL 찾음:", captionUrl);
            break;
          }
        }
      }
    }

    // 자막 URL을 찾지 못했을 경우
    if (!captionUrl) {
      appendLog(`[자막 없음] 비디오 ID: ${videoId}, 언어: ${language}`);

      // 사용 가능한 자막 정보 추출 시도
      let captionTracks: any[] = [];
      try {
        // 정규식으로 captionTracks 정보 추출
        const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
        if (captionTracksMatch && captionTracksMatch[1]) {
          captionTracks = JSON.parse(captionTracksMatch[1]);
        }
      } catch (e) {
        appendLog("[자막 트랙 추출 실패]", e);
      }

      // 사용 가능한 자막 정보 로깅
      if (captionTracks && captionTracks.length > 0) {
        const availableCaptions = captionTracks.map((track) => ({
          language: track.languageCode,
          name: track.name?.simpleText || "이름 없음",
        }));
        appendLogWithData(
          "[사용 가능한 자막]",
          JSON.stringify(availableCaptions, null, 2)
        );

        // 사용 가능한 자막 정보 파일 저장
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        const captionInfoPath = path.join(
          logDir,
          `available_captions_${videoId}_${timestamp}.json`
        );
        fs.writeFileSync(
          captionInfoPath,
          JSON.stringify(availableCaptions, null, 2)
        );
        appendLogWithData(
          `[로그 저장] 사용 가능한 자막 정보가 저장되었습니다: ${captionInfoPath}`,
          captionInfoPath
        );
      } else {
        appendLog("[사용 가능한 자막 없음] 자막 트랙을 찾을 수 없습니다.");
      }

      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    // 3. 자막 데이터 가져오기
    appendLog("[3단계] 자막 데이터 다운로드 중...");
    appendLog(`[자막 요청 URL] ${captionUrl}`);

    try {
      const captionResponse = await axios.get(captionUrl);
      appendLog("[3단계] 자막 데이터 다운로드 완료");
      appendLogWithData("[자막 응답 상태코드]", captionResponse.status);
      appendLogWithData(
        "[자막 응답 데이터 크기]",
        captionResponse.data?.length || 0
      );
      appendLogWithData(
        "[자막 응답 데이터 미리보기]",
        captionResponse.data.substring(0, 500) + "..."
      );

      // 4. 자막 파싱
      appendLog("[4단계] 자막 파싱 중...");
      const subtitles = parseSubtitles(captionResponse.data, appendLog);
      appendLogWithData("[4단계] 파싱된 자막 수:", subtitles.length);

      // 일부 자막 샘플 출력
      if (subtitles.length > 0) {
        appendLogWithData(
          "[4단계] 첫 번째 자막:",
          JSON.stringify(subtitles[0])
        );
        appendLogWithData(
          "[4단계] 마지막 자막:",
          JSON.stringify(subtitles[subtitles.length - 1])
        );
      }

      // 5. 자막 텍스트 추출
      appendLog("[5단계] 자막 텍스트 추출 중...");
      const textContent = subtitles.map((subtitle) => subtitle.text).join("\n");
      appendLogWithData("[5단계] 자막 텍스트 길이:", textContent.length);
      appendLogWithData(
        "[5단계] 자막 텍스트 샘플:",
        textContent.substring(0, 200) + "..."
      );

      // 6. 비디오 정보 추출 (이미 추출되었을 수도 있음)
      appendLog("[6단계] 비디오 정보 추출 중...");
      const videoInfoResult =
        finalVideoInfo || extractVideoInfo(html, playerResponseData, appendLog);
      appendLogWithData(
        "[6단계] 비디오 정보 추출 완료:",
        JSON.stringify(videoInfoResult)
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
      appendLog(`[자막 다운로드 실패] ${captionError.message}`);
      appendLogWithData(
        "[자막 에러 상세]",
        JSON.stringify(captionError.response || {})
      );
      throw new Error(
        `Failed to download caption data: ${captionError.message}`
      );
    }
  } catch (error: any) {
    appendLog("[자막 추출 실패] 상세 에러:");
    appendLog(error.message);

    // 네트워크 에러 추가 로깅
    if (error.isAxiosError) {
      appendLog(`[네트워크 에러] ${error.message}`);
      appendLog(`[요청 설정] ${JSON.stringify(error.config || {})}`);
      appendLog(`[응답 상태] ${error.response?.status || "None"}`);
      appendLog(`[응답 데이터] ${JSON.stringify(error.response?.data || {})}`);
    }

    throw error;
  }
}

function parseSubtitles(
  xmlData: string,
  logger?: (message: string) => void
): Subtitle[] {
  const log = (message: string) => {
    console.log(message);
    if (logger) logger(message);
  };

  const logWithData = (message: string, data: any) => {
    const formattedMessage = `${message} ${typeof data === "object" ? JSON.stringify(data) : data}`;
    console.log(formattedMessage);
    if (logger) logger(formattedMessage);
  };

  try {
    log("[자막 파싱] XML 데이터 파싱 시작");
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

    logWithData("[자막 파싱] 총 개수:", subtitles.length);
    return subtitles;
  } catch (e) {
    logWithData("[자막 파싱] 오류:", e.message);
    return [];
  }
}

function extractVideoInfo(
  html: string,
  playerResponseData?: any,
  logger?: (message: string) => void
): VideoInfo {
  const log = (message: string) => {
    console.log(message);
    if (logger) logger(message);
  };

  const logWithData = (message: string, data: any) => {
    const formattedMessage = `${message} ${typeof data === "object" ? JSON.stringify(data) : data}`;
    console.log(formattedMessage);
    if (logger) logger(formattedMessage);
  };

  log("[비디오 정보 추출] 시작");
  try {
    // playerResponseData가 있으면 먼저 활용
    if (playerResponseData && playerResponseData.videoDetails) {
      const { title, author, thumbnail } = playerResponseData.videoDetails;
      log("[비디오 정보 추출] playerResponse에서 정보 추출 성공");

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

    logWithData("[비디오 정보 추출] 완료:", videoInfo);
    return videoInfo;
  } catch (error) {
    logWithData("[비디오 정보 추출] 실패:", error.message);
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
    appendLog(`YouTube 영상 ID: ${videoId}, 언어: ${language} 처리 시작`);

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

    appendLog(`YouTube 응답 상태: ${response.status} ${response.statusText}`);
    appendLog(`응답 헤더: ${JSON.stringify(response.headers)}`);

    const html = response.data;
    if (!html) {
      appendLog("YouTube에서 HTML을 가져오지 못했습니다");
      throw new Error("YouTube에서 HTML을 가져오지 못했습니다");
    }

    appendLog(`YouTube HTML 응답 크기: ${html.length} 바이트`);

    // HTML 전체를 로그로 출력
    appendLog("[전체 HTML] 시작 =============================================");
    appendLog(html);
    appendLog("[전체 HTML] 끝 ===============================================");

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
        appendLog("[패턴1] ytInitialPlayerResponse 구조 발견");

        // 전체 구조 로깅(디버깅용)
        appendLogWithData(
          "[패턴1] playerRespData 키 목록:",
          Object.keys(playerRespData)
        );

        if (playerRespData.captions) {
          appendLog("[패턴1] captions 키 존재");
          appendLogWithData(
            "[패턴1] captions 구조:",
            JSON.stringify(playerRespData.captions).substring(0, 500)
          );

          const captionTracks =
            playerRespData.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks;
          if (captionTracks && captionTracks.length > 0) {
            appendLogWithData("[패턴1] 자막 트랙 개수:", captionTracks.length);

            // 가능한 언어들 로깅
            const langs = captionTracks
              .map(
                (t: any) =>
                  `${t.languageCode}(${t.name?.simpleText || "Unknown"})`
              )
              .join(", ");
            appendLogWithData("[패턴1] 사용 가능 언어:", langs);

            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              captionTracks.find((t: any) => t.languageCode === language) ||
              captionTracks.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              appendLogWithData("[패턴1] 자막 URL 찾음:", captionUrl);
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
            appendLog("[패턴1] captionTracks 없음 또는 빈 배열");
            if (playerRespData.captions.playerCaptionsTracklistRenderer) {
              appendLog(
                "[패턴1] playerCaptionsTracklistRenderer 구조:",
                JSON.stringify(
                  playerRespData.captions.playerCaptionsTracklistRenderer
                ).substring(0, 500)
              );
            }
          }
        } else {
          appendLog("[패턴1] captions 키 없음");

          // videoDetails 확인
          if (playerRespData.videoDetails) {
            appendLogWithData(
              "[패턴1] videoDetails 발견:",
              JSON.stringify(playerRespData.videoDetails).substring(0, 500)
            );
          }

          // 다른 구조 확인 (Translate API YouTube가 다양한 형태로 자막 정보를 제공할 수 있음)
          if (playerRespData.playerConfig) {
            appendLog("[패턴1] playerConfig 발견");

            if (playerRespData.playerConfig.captions) {
              appendLog(
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
        appendLog(`[패턴1] 파싱 실패: ${e}`);
      }
    } else {
      appendLog("[패턴1] ytInitialPlayerResponse 구조 찾지 못함");
    }

    // 패턴 2: ytInitialData 시도
    if (!captionUrl) {
      appendLog("[패턴2] ytInitialData 시도 중...");
      const initialData = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
      if (initialData && initialData[1]) {
        appendLog("[패턴2] ytInitialData 찾음");
        try {
          const initialJson = JSON.parse(initialData[1]);
          appendLogWithData(
            "[패턴2] ytInitialData 키 목록:",
            Object.keys(initialJson)
          );

          // 여러 가능한 경로 확인
          if (initialJson.playerOverlays) {
            appendLog("[패턴2] playerOverlays 발견");
            const playerOverlayData = initialJson.playerOverlays;
            appendLogWithData(
              "[패턴2] playerOverlays 키 목록:",
              Object.keys(playerOverlayData)
            );
          }

          if (initialJson.contents) {
            appendLog("[패턴2] contents 발견");
            // contents의 깊은 구조를 탐색해봅니다
            const contentsStr = JSON.stringify(initialJson.contents).substring(
              0,
              1000
            );
            appendLogWithData("[패턴2] contents 일부:", contentsStr);

            // captions 문자열 검색
            if (
              contentsStr.includes("caption") ||
              contentsStr.includes("subtitle")
            ) {
              appendLog(
                "[패턴2] contents에서 caption/subtitle 관련 문자열 발견"
              );
            }
          }
        } catch (e) {
          appendLog(`[패턴2] 파싱 실패: ${e}`);
        }
      } else {
        appendLog("[패턴2] ytInitialData 구조 찾지 못함");
      }
    }

    // 패턴 3: 원시 정규식 패턴
    if (!captionUrl) {
      appendLog("[패턴3] 정규식으로 자막 정보 직접 검색");

      // "captions":{"playerCaptionsTracklistRenderer" 패턴 시도
      const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
      if (captionsMatch && captionsMatch[1]) {
        appendLogWithData(
          '[패턴3] "captions" 패턴 발견:',
          captionsMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도 (객체가 완전하지 않을 수 있음)
          const captionsJson = JSON.parse(captionsMatch[1]);
          appendLogWithData(
            "[패턴3] 파싱 성공, 키 목록:",
            Object.keys(captionsJson)
          );
        } catch (e: any) {
          appendLog(`[패턴3] captions JSON 파싱 실패: ${e.message}`);
        }
      } else {
        appendLog('[패턴3] "captions" 패턴 찾지 못함');
      }

      // "captionTracks" 패턴 시도
      const captionTracksMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (captionTracksMatch && captionTracksMatch[1]) {
        appendLogWithData(
          '[패턴3] "captionTracks" 패턴 발견:',
          captionTracksMatch[1].substring(0, 500)
        );
        try {
          // JSON 파싱 시도
          const tracksJson = JSON.parse(captionTracksMatch[1]);
          appendLogWithData("[패턴3] 자막 트랙 개수:", tracksJson.length);

          // 자막 추출 시도
          if (tracksJson.length > 0) {
            // 요청된 언어 또는 영어 자막 찾기
            const targetTrack =
              tracksJson.find((t: any) => t.languageCode === language) ||
              tracksJson.find((t: any) => t.languageCode === "en");

            if (targetTrack && targetTrack.baseUrl) {
              captionUrl = targetTrack.baseUrl;
              appendLogWithData("[패턴3] 자막 URL 찾음:", captionUrl);
            }
          }
        } catch (e: any) {
          appendLog(`[패턴3] captionTracks JSON 파싱 실패: ${e.message}`);
        }
      } else {
        appendLog('[패턴3] "captionTracks" 패턴 찾지 못함');
      }

      // "playerCaptionsTracklistRenderer" 패턴 시도
      const tracklistMatch = html.match(
        /"playerCaptionsTracklistRenderer":\s*({[^}]+})/
      );
      if (tracklistMatch && tracklistMatch[1]) {
        appendLogWithData(
          '[패턴3] "playerCaptionsTracklistRenderer" 패턴 발견:',
          tracklistMatch[1].substring(0, 500)
        );
      } else {
        appendLog('[패턴3] "playerCaptionsTracklistRenderer" 패턴 찾지 못함');
      }

      // 전체 HTML에서 자막 관련 키워드 검색 (디버깅용)
      const hasCaptionKeyword = html.includes("captionTracks");
      const hasPlayerCaptionsKeyword = html.includes(
        "playerCaptionsTracklistRenderer"
      );
      appendLogWithData(
        '[패턴3] HTML에 "captionTracks" 포함 여부:',
        hasCaptionKeyword
      );
      appendLogWithData(
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
          appendLogWithData(
            `[패턴4] 키워드 '${pattern}' 발견 (인덱스: ${idx})`,
            idx
          );
          // 키워드 주변 컨텍스트 출력
          const context = html.substring(
            Math.max(0, idx - 100),
            Math.min(html.length, idx + 500)
          );
          appendLogWithData("[패턴4] 컨텍스트:", context);

          // 'timedtext'가 포함된 URL 찾기 시도
          const urlMatches = context.match(
            /(https?:\/\/[^"'\s,}]+timedtext[^"'\s,}]+)/
          );
          if (urlMatches && urlMatches[1]) {
            captionUrl = urlMatches[1];
            appendLogWithData("[패턴4] 자막 URL 찾음:", captionUrl);
            break;
          }
        }
      }
    }

    // 자막 URL을 찾지 못했을 경우
    if (!captionUrl) {
      appendLog("[모든 패턴] 자막 URL을 찾지 못했습니다");
      throw new Error(`Could not find captions for video: ${videoId}`);
    }

    // 3. 자막 데이터 가져오기
    appendLog("[3단계] 자막 데이터 다운로드 중...");
    appendLog(`[자막 요청 URL] ${captionUrl}`);

    try {
      const captionResponse = await axios.get(captionUrl);
      appendLog("[3단계] 자막 데이터 다운로드 완료");
      appendLogWithData("[자막 응답 상태코드]", captionResponse.status);
      appendLogWithData(
        "[자막 응답 데이터 크기]",
        captionResponse.data?.length || 0
      );
      appendLogWithData(
        "[자막 응답 데이터 미리보기]",
        captionResponse.data.substring(0, 500) + "..."
      );

      // 4. 자막 파싱
      appendLog("[4단계] 자막 파싱 중...");
      const subtitles = parseSubtitles(captionResponse.data, appendLog);
      appendLogWithData("[4단계] 파싱된 자막 수:", subtitles.length);

      // 일부 자막 샘플 출력
      if (subtitles.length > 0) {
        appendLogWithData(
          "[4단계] 첫 번째 자막:",
          JSON.stringify(subtitles[0])
        );
        appendLogWithData(
          "[4단계] 마지막 자막:",
          JSON.stringify(subtitles[subtitles.length - 1])
        );
      }

      // 5. 자막 텍스트 추출
      appendLog("[5단계] 자막 텍스트 추출 중...");
      const textContent = subtitles.map((subtitle) => subtitle.text).join("\n");
      appendLogWithData("[5단계] 자막 텍스트 길이:", textContent.length);
      appendLogWithData(
        "[5단계] 자막 텍스트 샘플:",
        textContent.substring(0, 200) + "..."
      );

      // 6. 비디오 정보 추출 (이미 추출되었을 수도 있음)
      appendLog("[6단계] 비디오 정보 추출 중...");
      const videoInfoResult =
        finalVideoInfo || extractVideoInfo(html, playerResponseData, appendLog);
      appendLogWithData(
        "[6단계] 비디오 정보 추출 완료:",
        JSON.stringify(videoInfoResult)
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
      appendLog(`[자막 다운로드 실패] ${captionError.message}`);
      appendLogWithData(
        "[자막 에러 상세]",
        JSON.stringify(captionError.response || {})
      );
      throw new Error(
        `Failed to download caption data: ${captionError.message}`
      );
    }
  } catch (error: any) {
    appendLog("[자막 추출 실패] 상세 에러:");
    appendLog(error.message);

    // 네트워크 에러 추가 로깅
    if (error.isAxiosError) {
      appendLog(`[네트워크 에러] ${error.message}`);
      appendLog(`[요청 설정] ${JSON.stringify(error.config || {})}`);
      appendLog(`[응답 상태] ${error.response?.status || "None"}`);
      appendLog(`[응답 데이터] ${JSON.stringify(error.response?.data || {})}`);
    }

    throw error;
  }
}

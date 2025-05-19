const axios = require("axios");
const { getSubtitles } = require("youtube-caption-scraper");

exports.handler = async function (event, context) {
  // CORS 헤더 설정
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    // POST 요청의 본문에서 데이터 추출
    const data = JSON.parse(event.body);
    const { url, language } = data;

    // URL에서 비디오 ID 추출
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^\/\?\&]+)/
    );
    const videoId = videoIdMatch && videoIdMatch[1];

    if (!videoId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "유효한 YouTube URL이 아닙니다.",
        }),
      };
    }

    console.log(
      `YouTube 자막 추출 시작: videoId=${videoId}, language=${language || "ko"}`
    );

    // 비디오 정보 가져오기
    const getVideoInfo = async () => {
      try {
        const response = await axios.get(
          `https://www.youtube.com/watch?v=${videoId}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );

        // HTML에서 정보 추출 시도
        const html = response.data;
        let title = `YouTube 비디오 (${videoId})`;
        let channelName = "채널 이름";

        // 제목 추출
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(" - YouTube", "");
        }

        // 채널명 추출
        const channelMatch = html.match(/"ownerChannelName":"([^"]*)"/);
        if (channelMatch && channelMatch[1]) {
          channelName = channelMatch[1];
        }

        return {
          title,
          channelName,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          videoId,
        };
      } catch (error) {
        console.error("비디오 정보 가져오기 실패:", error.message);
        return {
          title: `YouTube 비디오 (${videoId})`,
          channelName: "채널 이름",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          videoId,
        };
      }
    };

    // 자막 가공 함수
    const processCaptions = (captions) => {
      return captions.map((caption) => {
        const start = parseFloat(caption.start);
        const dur = parseFloat(caption.dur);
        return {
          text: caption.text,
          start,
          end: start + dur,
          startFormatted: formatTime(start),
        };
      });
    };

    // 시간 포맷팅 함수
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    };

    // 실제 YouTube 자막 가져오기
    console.log("유튜브 자막 가져오기 시도 중...");
    const rawCaptions = await getSubtitles({
      videoID: videoId,
      lang: language || "ko",
    });
    console.log(`자막 가져오기 성공: ${rawCaptions.length}개 항목`);

    // 자막 가공
    const subtitles = processCaptions(rawCaptions);

    // 비디오 정보 가져오기
    const videoInfo = await getVideoInfo();

    // 전체 자막 텍스트 조합
    const fullText = subtitles.map((item) => item.text).join(" ");

    // 최종 응답
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          subtitles,
          fullText,
          videoInfo,
          isDemo: false,
        },
      }),
    };
  } catch (error) {
    console.error("자막 처리 실패:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "자막을 추출할 수 없습니다.",
        details: error.message,
      }),
    };
  }
};

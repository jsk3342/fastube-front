const axios = require("axios");

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

    // 실제 환경에서는 자막 추출 로직 필요
    // 여기서는 데모 데이터로 대체

    // 간단한 데모 자막 생성
    const generateDemoSubtitles = (videoId, language) => {
      const subtitles = [];

      for (let i = 0; i < 10; i++) {
        subtitles.push({
          start: i * 10,
          dur: 5,
          text: `이것은 ${language} 자막의 ${
            i + 1
          }번째 문장입니다. (비디오 ID: ${videoId})`,
        });
      }

      return subtitles;
    };

    const subtitles = generateDemoSubtitles(videoId, language);

    // 비디오 정보 (실제로는 별도의 API 호출 필요)
    const videoInfo = {
      title: `YouTube 비디오 (${videoId})`,
      channelName: "채널 이름",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          subtitles: subtitles,
          fullText: subtitles.map((item) => item.text).join(" "),
          videoInfo: {
            ...videoInfo,
            videoId,
          },
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

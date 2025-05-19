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
    // URL 쿼리 파라미터 추출
    const params = event.queryStringParameters;
    const videoId = params.v;

    if (!videoId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "비디오 ID가 필요합니다.",
        }),
      };
    }

    // YouTube 동영상 정보 URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // YouTube에 요청 보내기
    const response = await axios({
      method: "GET",
      url: youtubeUrl,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    });

    // 간단한 정보 추출 (실제 프로덕션에서는 더 정교한 파싱 필요)
    const html = response.data;

    // 임시 응답 데이터 (실제로는 HTML에서 파싱해야 함)
    const videoInfo = {
      success: true,
      data: {
        title: videoId ? `YouTube 비디오 (${videoId})` : "YouTube 비디오",
        channelName: "채널 이름",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 120, // 예시 값
        availableLanguages: ["ko", "en"],
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(videoInfo),
    };
  } catch (error) {
    console.error("YouTube API 요청 실패:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "동영상 정보를 가져오는 중 오류가 발생했습니다.",
        details: error.message,
      }),
    };
  }
};

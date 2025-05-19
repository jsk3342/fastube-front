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

    console.log(`비디오 정보 요청: videoId=${videoId}`);

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

    // HTML에서 비디오 정보 추출
    const html = response.data;

    // 제목 추출
    let title = `YouTube 비디오 (${videoId})`;
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(" - YouTube", "");
    }

    // 채널 이름 추출
    let channelName = "채널 이름";
    const channelMatch = html.match(/"ownerChannelName":"([^"]*)"/);
    if (channelMatch && channelMatch[1]) {
      channelName = channelMatch[1];
    }

    // 동영상 길이 추출 (초 단위)
    let duration = 0;
    const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
    if (durationMatch && durationMatch[1]) {
      duration = parseInt(durationMatch[1], 10);
    }

    // 사용 가능한 자막 언어 목록 (간단한 정규식으로 추출)
    let availableLanguages = ["ko", "en"];
    const captionsMatch = html.match(/"captionTracks":\[(.*?)\]/s);
    if (captionsMatch && captionsMatch[1]) {
      const captionsData = captionsMatch[1];
      const languageCodes = captionsData.match(/"languageCode":"([^"]*)"/g);

      if (languageCodes && languageCodes.length > 0) {
        availableLanguages = languageCodes.map((code) =>
          code.replace(/"languageCode":"([^"]*)"/, "$1")
        );
      }
    }

    console.log(
      `비디오 정보 추출 완료: 제목=${title}, 채널=${channelName}, 길이=${duration}초`
    );

    // 추출된 정보로 응답 생성
    const videoInfo = {
      success: true,
      data: {
        title,
        channelName,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration,
        availableLanguages,
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

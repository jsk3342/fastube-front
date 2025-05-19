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

    // 간단한 데모 자막 생성
    const generateDemoSubtitles = (videoId, language) => {
      const subtitles = [];

      // 시간 포맷을 "00:00.000" 형식으로 변환하는 함수
      const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        return `${minutes.toString().padStart(2, "0")}:${secs
          .toString()
          .padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
      };

      for (let i = 0; i < 10; i++) {
        const startSeconds = i * 10;
        subtitles.push({
          start: startSeconds.toString(),
          dur: "5",
          text: `이것은 ${language} 자막의 ${
            i + 1
          }번째 문장입니다. (비디오 ID: ${videoId})`,
        });
      }

      return subtitles;
    };

    // 비디오 정보
    const getVideoInfo = async (videoId) => {
      try {
        // YouTube에 요청 보내기
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await axios({
          method: "GET",
          url: youtubeUrl,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          },
        });

        // 간단한 정보로 응답
        return {
          title: `YouTube 비디오 (${videoId})`,
          channelName: "채널 이름",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        };
      } catch (error) {
        console.error("비디오 정보 가져오기 실패:", error);
        return {
          title: `YouTube 비디오 (${videoId})`,
          channelName: "채널 이름",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        };
      }
    };

    // 병렬로 자막과 비디오 정보 가져오기
    const [subtitles, videoInfo] = await Promise.all([
      generateDemoSubtitles(videoId, language),
      getVideoInfo(videoId),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          subtitles,
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

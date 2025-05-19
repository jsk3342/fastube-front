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
      `YouTube 자막 추출 시작: videoId=${videoId}, language=${language}`
    );

    // 실제 YouTube 자막 가져오기
    const fetchRealSubtitles = async (videoId, language) => {
      try {
        // youtube-caption-scraper 라이브러리를 사용하여 실제 자막 가져오기
        const options = {
          videoID: videoId,
          lang: language || "ko", // 기본값 한국어
        };

        console.log("자막 요청 옵션:", options);
        const captions = await getSubtitles(options);
        console.log(`자막 ${captions.length}개 가져옴`);

        return captions;
      } catch (error) {
        console.error("자막 가져오기 실패:", error);
        // 에러 발생 시 빈 배열 대신 에러를 throw
        throw new Error(`자막 가져오기 실패: ${error.message}`);
      }
    };

    // 비디오 정보 가져오기
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

        // HTML에서 비디오 제목과 채널 정보 추출 시도
        const html = response.data;
        let title = videoId;
        let channelName = "채널";

        // 제목 추출 시도
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(" - YouTube", "");
        }

        // 채널 이름 추출 시도 (간단한 방식)
        const channelMatch = html.match(/"ownerChannelName":"([^"]*)"/);
        if (channelMatch && channelMatch[1]) {
          channelName = channelMatch[1];
        }

        return {
          title,
          channelName,
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
      fetchRealSubtitles(videoId, language),
      getVideoInfo(videoId),
    ]);

    // 자막 텍스트 결합
    const fullText = subtitles.map((item) => item.text).join(" ");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          subtitles,
          fullText,
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

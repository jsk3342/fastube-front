import swaggerJSDoc from "swagger-jsdoc";
import config from "../config/index";
import { ENDPOINTS } from "../routes/index";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Fastube API",
      version: "1.0.0",
      description: "Fastube 백엔드 API 문서",
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Health",
        description: "서버 상태 확인 API",
      },
      {
        name: "Subtitles",
        description: "YouTube 자막 관련 API",
      },
      {
        name: "Video",
        description: "YouTube 비디오 정보 관련 API",
      },
    ],
  },
  apis: ["./src/routes/*.ts"], // 라우트 파일 경로
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;

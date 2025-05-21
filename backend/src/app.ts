import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import config from "./config/index";
import swaggerSpec from "./docs/swagger";
import { subtitleRoutes, healthRoutes, ENDPOINTS } from "./routes/index";
import { SubtitleController } from "./controllers/subtitleController";
import {
  errorHandlerMiddleware,
  notFoundMiddleware,
} from "./middlewares/errorMiddleware";

// Express 앱 생성
const app = express();

// 환경 설정
const isProduction = process.env.NODE_ENV === "production";

// 미들웨어 설정
app.use(helmet()); // 보안 헤더 설정

// CORS 설정 - 서버리스 환경에서 좀 더 유연하게
app.use(
  cors({
    origin: config.corsOrigin || "*", // 설정이 없으면 모든 오리진 허용
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

app.use(express.json()); // JSON 파싱
app.use(express.urlencoded({ extended: true })); // URL 인코딩 파싱

// 개발 환경에서만 자세한 로깅 사용
if (!isProduction) {
  app.use(morgan("dev")); // 로깅
}

// API 경로 프리픽스
const apiPrefix = config.apiPrefix;

// 기본 경로 핸들러 추가
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Fastube API Server is running",
    environment: process.env.NODE_ENV || "development",
    documentation: `${apiPrefix}${ENDPOINTS.DOCS}`,
    timestamp: new Date().toISOString(),
  });
});

// Swagger 문서 설정
app.use(
  `${apiPrefix}${ENDPOINTS.DOCS}`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

// 라우트 설정
app.use(`${apiPrefix}${ENDPOINTS.SUBTITLES}`, subtitleRoutes);
app.use(`${apiPrefix}${ENDPOINTS.HEALTH}`, healthRoutes);

// 비디오 정보 API는 SubtitleController에서 직접 핸들러를 가져와 사용
const subtitleController = new SubtitleController();
app.get(
  `${apiPrefix}${ENDPOINTS.VIDEO_INFO}`,
  subtitleController.getVideoInfo.bind(subtitleController)
);

// 에러 핸들링 미들웨어 - 서버리스 환경에 적합하게 수정
// 404 에러 처리
app.use(notFoundMiddleware);

// 글로벌 에러 핸들러 - 서버리스 환경에서도 안정적으로 작동하도록
app.use((err, req, res, next) => {
  console.error(`[Error]: ${err.message}`);
  if (err.stack && !isProduction) {
    console.error(err.stack);
  }

  // 기존 errorHandlerMiddleware 사용
  errorHandlerMiddleware(err, req, res, next);
});

// 서버리스 함수 핸들러를 위한 설정
export default app;

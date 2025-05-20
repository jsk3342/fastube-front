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

// 미들웨어 설정
app.use(helmet()); // 보안 헤더 설정
app.use(cors({ origin: config.corsOrigin })); // CORS 설정
app.use(express.json()); // JSON 파싱
app.use(express.urlencoded({ extended: true })); // URL 인코딩 파싱
app.use(morgan("dev")); // 로깅

// API 경로 프리픽스
const apiPrefix = config.apiPrefix;

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

// 404 에러 처리
app.use(notFoundMiddleware);

// 글로벌 에러 핸들러
app.use(errorHandlerMiddleware);

export default app;

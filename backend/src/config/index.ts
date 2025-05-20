import dotenv from "dotenv";
import path from "path";

// .env 파일 로드
dotenv.config({ path: path.join(__dirname, "../../.env") });

// 환경 변수 설정
const config = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  apiPrefix: process.env.API_PREFIX || "/api",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
};

export default config;

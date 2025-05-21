const express = require("express");
const cors = require("cors");
const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());

// 루트 경로
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Fastube API Server is running",
    timestamp: new Date().toISOString(),
  });
});

// 헬스 체크 엔드포인트
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API 프리픽스 없는 헬스 체크 (대체 경로)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 모든 라우트에 대한 오류 핸들러
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Path ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString(),
  });
});

// 로컬 개발 환경에서만 서버 시작
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Vercel 서버리스 함수 내보내기
module.exports = app;

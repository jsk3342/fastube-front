// api/index.js
const express = require("express");
const app = express();

// 미들웨어
app.use(express.json());

// 루트 경로
app.get("/", (req, res) => {
  res.json({ message: "Hello from Vercel API!" });
});

// 헬스 체크
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API 버전 정보
app.get("/version", (req, res) => {
  res.json({ version: "1.0.0", env: process.env.NODE_ENV });
});

// Express 앱을 서버리스 함수로 변환
module.exports = (req, res) => {
  // Express 앱으로 요청 라우팅
  return app(req, res);
};

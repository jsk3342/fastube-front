// server.js
const express = require("express");
const app = express();

// 미들웨어
app.use(express.json());

// 루트 경로
app.get("/", (req, res) => {
  res.json({ message: "Hello from Vercel!" });
});

// 헬스 체크
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 404 핸들러
app.use("*", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// 서버리스 함수로 내보내기
module.exports = app;

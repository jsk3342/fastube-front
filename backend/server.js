const express = require('express');
const app = express();

// 모든 요청 로깅
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url}`);
  next();
});

// JSON 미들웨어
app.use(express.json());

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    message: 'Fastube API is running',
    timestamp: new Date().toISOString()
  });
});

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// API 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// 서버리스 함수 내보내기
module.exports = app;
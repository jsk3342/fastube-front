import app from "./app";
import config from "./config/index";

const PORT = config.port;

// 서버 시작
app.listen(PORT, () => {
  console.log(`
  ╔═════════════════════════════════════════════════╗
  ║             FASTUBE API SERVER STARTED           ║
  ╠═════════════════════════════════════════════════╣
  ║                                                 ║
  ║   🚀 Server running on port: ${PORT}              ║
  ║   🌍 Environment: ${config.nodeEnv}                ║
  ║   📚 API Docs: http://localhost:${PORT}${config.apiPrefix}/docs ║
  ║                                                 ║
  ╚═════════════════════════════════════════════════╝
  `);
});

// 예기치 않은 오류 처리
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

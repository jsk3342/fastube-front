import app from "./app";
import config from "./config/index";

// 로컬 개발 환경에서만 서버 시작
if (process.env.NODE_ENV !== "production") {
  const PORT = config.port;

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
}

// 예기치 않은 오류 처리
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  if (process.env.NODE_ENV === "production") return;
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  if (process.env.NODE_ENV === "production") return;
  process.exit(1);
});

// Vercel 서버리스 함수용 내보내기
export default app;

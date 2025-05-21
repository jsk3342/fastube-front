import app from "./app";
import config from "./config/index";

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

// Vercel 서버리스 함수용 내보내기
export default app;

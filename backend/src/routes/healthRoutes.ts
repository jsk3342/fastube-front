import { Router, Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: API 서버의 상태를 확인합니다.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서버가 정상적으로 작동 중입니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   example: "2023-08-01T12:00:00.000Z"
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 */
router.get("/", (req: Request, res: Response) => {
  const packageJson = require("../../package.json");
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: packageJson.version,
  });
});

export default router;

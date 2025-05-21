import { Router } from "express";
import { body, query } from "express-validator";
import { SubtitleController } from "../controllers/subtitleController";

const router = Router();
const subtitleController = new SubtitleController();

/**
 * @swagger
 * /api/subtitles:
 *   post:
 *     summary: YouTube 영상의 자막을 가져옵니다.
 *     tags: [Subtitles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: YouTube 영상 URL
 *                 example: "https://www.youtube.com/watch?v=eATWip-H0WQ"
 *               language:
 *                 type: string
 *                 description: "자막 언어 코드"
 *                 default: "ko"
 *     responses:
 *       200:
 *         description: 성공적으로 자막을 가져왔습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     subtitles:
 *                       type: array
 *                     text:
 *                       type: string
 *                     videoInfo:
 *                       type: object
 *       400:
 *         description: 잘못된 요청 파라미터
 *       500:
 *         description: 서버 오류
 */
router.post(
  "/",
  [
    body("url").isURL().withMessage("유효한 URL을 입력해주세요."),
    body("language")
      .optional()
      .isString()
      .withMessage("유효한 언어 코드를 입력해주세요."),
  ],
  subtitleController.getSubtitles.bind(subtitleController)
);

/**
 * @swagger
 * /api/video/info:
 *   get:
 *     summary: YouTube 영상 정보를 가져옵니다.
 *     tags: [Video]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: YouTube 비디오 ID
 *     responses:
 *       200:
 *         description: 성공적으로 비디오 정보를 가져왔습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     channelName:
 *                       type: string
 *                     thumbnailUrl:
 *                       type: string
 *                     duration:
 *                       type: number
 *                     availableLanguages:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: 잘못된 요청 파라미터
 *       500:
 *         description: 서버 오류
 */
router.get(
  "/video/info",
  [query("id").isString().withMessage("유효한 비디오 ID를 입력해주세요.")],
  subtitleController.getVideoInfo.bind(subtitleController)
);

export default router;

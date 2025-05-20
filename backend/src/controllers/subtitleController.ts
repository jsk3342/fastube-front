import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { SubtitleService } from "../services/subtitleService";

const subtitleService = new SubtitleService();

export class SubtitleController {
  // YouTube 자막 가져오기
  public async getSubtitles(req: Request, res: Response): Promise<void> {
    try {
      // 유효성 검사 오류 확인
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { url, language } = req.body;

      // 서비스 호출
      const result = await subtitleService.getSubtitlesFromYoutube({
        url,
        language,
      });

      res.status(200).json(result);
    } catch (error: any) {
      console.error("자막 컨트롤러 오류:", error);
      res.status(500).json({
        success: false,
        message: error.message || "자막을 가져오는 중 오류가 발생했습니다.",
      });
    }
  }

  // 비디오 정보 가져오기
  public async getVideoInfo(req: Request, res: Response): Promise<void> {
    try {
      // 유효성 검사 오류 확인
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { id } = req.query;

      if (!id || typeof id !== "string") {
        res.status(400).json({
          success: false,
          message: "유효한 비디오 ID가 필요합니다.",
        });
        return;
      }

      // 여기서는 간단한 예시로 더미 데이터 반환
      // 실제 구현에서는 YouTube Data API를 사용하여 비디오 정보를 가져와야 함
      res.status(200).json({
        success: true,
        data: {
          title: `Video ${id}`,
          channelName: "YouTube Channel",
          thumbnailUrl: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
          duration: 300, // 초 단위
          availableLanguages: ["ko", "en", "ja", "zh-CN"],
        },
      });
    } catch (error: any) {
      console.error("비디오 정보 컨트롤러 오류:", error);
      res.status(500).json({
        success: false,
        message:
          error.message || "비디오 정보를 가져오는 중 오류가 발생했습니다.",
      });
    }
  }
}

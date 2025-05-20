import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { SubtitleService } from "../services/subtitleService";
import { fetchYouTubeVideoInfo } from "../utils/youtubeUtils";

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
      console.log("url", url);
      console.log("language", language);

      // 서비스 호출
      const result = await subtitleService.getSubtitlesFromYoutube({
        url,
        language,
      });
      console.log("result", result);

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

      // 실제 YouTube 정보 가져오기
      const videoInfo = await fetchYouTubeVideoInfo(id);

      // 사용 가능한 자막 언어 목록 (실제로는 YouTube API에서 가져와야 함)
      const availableLanguages = ["ko", "en", "ja", "zh-CN"];

      res.status(200).json({
        success: true,
        data: {
          title: videoInfo.title,
          channelName: videoInfo.channelName,
          thumbnailUrl: videoInfo.thumbnailUrl,
          duration: 300, // 초 단위 (실제로는 YouTube API에서 가져와야 함)
          availableLanguages,
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

import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { SubtitleService } from "../services/subtitleService";
import { fetchYouTubeVideoInfo } from "../utils/youtubeUtils";

export class SubtitleController {
  private subtitleService: SubtitleService;

  constructor() {
    this.subtitleService = new SubtitleService();
  }

  // YouTube 자막 가져오기
  public async getSubtitles(req: Request, res: Response): Promise<void> {
    try {
      const { url, language = "ko" } = req.body;
      const videoId = this.subtitleService.extractVideoId(url);

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error: "유효하지 않은 YouTube URL입니다.",
        });
      }

      try {
        // 요청된 언어로 자막 가져오기 시도
        const subtitles = await this.subtitleService.getSubtitlesFromYoutube(
          videoId,
          language
        );
        return res.json({
          success: true,
          data: {
            text: this.subtitleService.formatSubtitles(subtitles),
            videoInfo: await this.subtitleService.getVideoInfo(videoId),
          },
        });
      } catch (error) {
        // 요청된 언어로 실패하면 영어 자막으로 대체
        console.log("영어 자막으로 대체 시도");
        const englishSubtitles =
          await this.subtitleService.getSubtitlesFromYoutube(videoId, "en");
        return res.json({
          success: true,
          data: {
            text: this.subtitleService.formatSubtitles(englishSubtitles),
            videoInfo: await this.subtitleService.getVideoInfo(videoId),
          },
        });
      }
    } catch (error) {
      console.error("자막 컨트롤러 오류:", error);
      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "자막을 가져오는 중 오류가 발생했습니다.",
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

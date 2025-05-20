import { Request, Response } from "express";
import { getSubtitlesDirectly } from "../utils/youtubeUtils";
import { SubtitleItem } from "../types/subtitle";
import he from "he";
import striptags from "striptags";
import ytdl from "ytdl-core";

interface VideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videoId: string;
}

export interface SubtitleRequest {
  url: string;
  language: string;
}

export interface SubtitleResponse {
  success: boolean;
  data: {
    subtitles: SubtitleItem[];
    text: string;
    videoInfo: VideoInfo;
  };
}

export class SubtitleService {
  private extractVideoId(url: string): string | null {
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  }

  private parseSubtitles(xmlData: string): SubtitleItem[] {
    const lines = xmlData
      .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', "")
      .replace("</transcript>", "")
      .split("</text>")
      .filter((line) => line && line.trim())
      .map((line) => {
        const startRegex = /start="([\d.]+)"/;
        const durRegex = /dur="([\d.]+)"/;

        const startMatch = startRegex.exec(line);
        const durMatch = durRegex.exec(line);

        if (!startMatch || !durMatch) {
          return null;
        }

        const start = startMatch[1];
        const dur = durMatch[1];

        const htmlText = line
          .replace(/<text.+>/, "")
          .replace(/&amp;/gi, "&")
          .replace(/<\/?[^>]+(>|$)/g, "");

        const decodedText = he.decode(htmlText);
        const text = striptags(decodedText);

        return {
          start,
          dur,
          text,
        };
      })
      .filter(Boolean) as SubtitleItem[];

    if (!lines || lines.length === 0) {
      throw new Error("자막 내용을 추출할 수 없습니다.");
    }

    return lines;
  }

  private formatSubtitles(subtitles: SubtitleItem[]): string {
    return subtitles.map((item) => item.text).join(" ");
  }

  private async getVideoInfo(videoId: string): Promise<VideoInfo> {
    try {
      const video = await ytdl.getInfo(videoId);
      return {
        title: video.videoDetails.title,
        channelName: video.videoDetails.author.name,
        thumbnailUrl: video.videoDetails.thumbnails[0].url,
        videoId,
      };
    } catch (error) {
      console.error("비디오 정보 가져오기 실패:", error);
      return {
        title: `Video ${videoId}`,
        channelName: "YouTube Channel",
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoId,
      };
    }
  }

  async getSubtitlesFromYoutube(
    videoId: string,
    language: string
  ): Promise<SubtitleItem[]> {
    try {
      console.log(`${language} 자막 가져오기 시도`);
      const subtitles = await getSubtitlesDirectly(videoId, language);
      return this.parseSubtitles(subtitles);
    } catch (error) {
      console.error(`${language} 자막 가져오기 실패:`, error);
      throw error;
    }
  }

  async getSubtitles(req: Request, res: Response) {
    try {
      const { url, language = "ko" } = req.body;
      const videoId = this.extractVideoId(url);

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error: "유효하지 않은 YouTube URL입니다.",
        });
      }

      try {
        // 요청된 언어로 자막 가져오기 시도
        const subtitles = await this.getSubtitlesFromYoutube(videoId, language);
        return res.json({
          success: true,
          data: {
            text: this.formatSubtitles(subtitles),
            videoInfo: await this.getVideoInfo(videoId),
          },
        });
      } catch (error) {
        // 요청된 언어로 실패하면 영어 자막으로 대체
        console.log("영어 자막으로 대체 시도");
        const englishSubtitles = await this.getSubtitlesFromYoutube(
          videoId,
          "en"
        );
        return res.json({
          success: true,
          data: {
            text: this.formatSubtitles(englishSubtitles),
            videoInfo: await this.getVideoInfo(videoId),
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
}

declare module "youtube-caption-scraper" {
  interface SubtitleOptions {
    videoId: string;
    lang?: string;
  }

  interface SubtitleResult {
    text: string;
    start: number;
    dur: number;
  }

  export function getSubtitles(
    options: SubtitleOptions
  ): Promise<SubtitleResult[]>;
}

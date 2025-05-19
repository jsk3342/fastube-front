declare module "youtube-captions-scraper" {
  export interface CaptionOptions {
    videoID: string;
    lang?: string;
  }

  export interface Caption {
    start: string;
    dur: string;
    text: string;
  }

  export function getSubtitles(options: CaptionOptions): Promise<Caption[]>;
}

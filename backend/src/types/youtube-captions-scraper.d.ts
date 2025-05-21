declare module "youtube-captions-scraper" {
  export interface Caption {
    start: number;
    dur: number;
    text: string;
  }

  export function getSubtitles(options: {
    videoID: string;
    lang?: string;
  }): Promise<Caption[]>;

  export function getLanguages(videoID: string): Promise<
    Array<{
      lang: string;
      name: string;
    }>
  >;
}

declare module 'youtube-captions-scraper' {
  export interface Caption {
    start: string;
    dur: string;
    text: string;
  }

  export interface GetSubtitlesOptions {
    videoID: string;
    lang?: string;
  }

  export function getSubtitles(
    options: GetSubtitlesOptions,
  ): Promise<Caption[]>;
  export function getCaptions(videoID: string): Promise<any>;
}

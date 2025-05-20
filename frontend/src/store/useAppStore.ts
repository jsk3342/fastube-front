import { create } from "zustand";
import { type SubtitleItem, type VideoInfo } from "@/apis/queries/useSubtitles";

interface AppState {
  // 다크 모드 관련 상태
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // URL 입력 관련 상태
  url: string;
  setUrl: (url: string) => void;

  // 언어 관련 상태
  language: string;
  setLanguage: (language: string) => void;

  // 결과 텍스트 관련 상태
  subtitleText: string;
  setSubtitleText: (text: string) => void;

  // 자막 아이템 관련 상태
  subtitleItems: SubtitleItem[];
  setSubtitleItems: (items: SubtitleItem[]) => void;

  // 비디오 정보 관련 상태
  videoId: string | null;
  setVideoId: (id: string) => void;

  videoInfo: VideoInfo | null;
  setVideoInfo: (info: VideoInfo) => void;

  // 로딩 상태
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // 에러 상태
  error: string | null;
  setError: (error: string | null) => void;

  // 초기화 함수
  resetState: () => void;

  // 간단한 자막 관련 상태
  isSimplified: boolean;
  toggleSimplified: () => void;

  // 모달 관련 상태
  isModalOpen: boolean;
  setIsModalOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 다크 모드 초기값은 시스템 설정 기반
  isDarkMode: window.matchMedia("(prefers-color-scheme: dark)").matches,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

  // URL 관련 상태
  url: "",
  setUrl: (url) => set({ url }),

  // 언어 관련 상태
  language: "ko",
  setLanguage: (language) => set({ language }),

  // 자막 텍스트 관련 상태
  subtitleText: "",
  setSubtitleText: (text) => set({ subtitleText: text }),

  // 자막 아이템 관련 상태
  subtitleItems: [],
  setSubtitleItems: (items) => set({ subtitleItems: items }),

  // 비디오 정보 관련 상태
  videoId: null,
  setVideoId: (id) => set({ videoId: id }),

  videoInfo: null,
  setVideoInfo: (info) => set({ videoInfo: info }),

  // 로딩 상태
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // 에러 상태
  error: null,
  setError: (error) => set({ error }),

  // 상태 초기화
  resetState: () =>
    set({
      url: "",
      subtitleText: "",
      subtitleItems: [],
      videoId: null,
      videoInfo: null,
      error: null,
      isSimplified: false,
      isModalOpen: false,
    }),

  // 간단한 자막 관련 상태
  isSimplified: false,
  toggleSimplified: () =>
    set((state) => ({ isSimplified: !state.isSimplified })),

  // 모달 관련 상태
  isModalOpen: false,
  setIsModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
}));

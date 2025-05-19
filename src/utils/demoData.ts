import { type Caption } from "youtube-captions-scraper";

// 데모 자막 데이터
export const demoCaptions: Caption[] = [
  {
    start: "0",
    dur: "6.64",
    text: "안녕하세요, 오늘은 리액트에서 상태 관리에 대해 알아보겠습니다.",
  },
  {
    start: "6.64",
    dur: "5.28",
    text: "리액트에서 상태 관리는 매우 중요한 개념입니다.",
  },
  {
    start: "11.92",
    dur: "7.04",
    text: "useState는 가장 기본적인 리액트 훅으로, 컴포넌트 내에서 상태를 관리합니다.",
  },
  {
    start: "18.96",
    dur: "8.68",
    text: "다음으로 useReducer는 복잡한 상태 로직을 다룰 때 유용합니다.",
  },
  {
    start: "27.64",
    dur: "6.28",
    text: "전역 상태 관리를 위해서는 Context API나 Zustand, Redux 등을 사용할 수 있습니다.",
  },
  {
    start: "33.92",
    dur: "5.68",
    text: "Zustand는 간단하고 직관적인 API를 제공하는 상태 관리 라이브러리입니다.",
  },
  {
    start: "39.6",
    dur: "7.24",
    text: "Redux는 복잡한 앱에서 예측 가능한 상태 관리를 위한 도구입니다.",
  },
  {
    start: "46.84",
    dur: "8.08",
    text: "상태 관리 도구를 선택할 때는 프로젝트의 복잡성과 팀의 경험을 고려해야 합니다.",
  },
  {
    start: "54.92",
    dur: "6.2",
    text: "작은 프로젝트에서는 useState와 Context만으로도 충분할 수 있습니다.",
  },
  {
    start: "61.12",
    dur: "8.48",
    text: "이상으로 리액트 상태 관리에 대한 기본적인 소개를 마치겠습니다. 감사합니다.",
  },
];

// 데모 비디오 정보
export const demoVideoInfo = {
  title: "리액트 상태 관리 소개",
  channelName: "코딩 스튜디오",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  videoId: "dQw4w9WgXcQ", // 유명한 유튜브 영상 ID
  duration: 70, // 초 단위
  availableLanguages: ["ko", "en", "ja", "zh", "es", "fr"],
};

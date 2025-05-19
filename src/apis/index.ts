import axios from "axios";

// API base URL 설정 - 로컬 개발 또는 배포 환경에 따라 다르게 설정
const isDevelopment = import.meta.env.DEV;
const baseURL = isDevelopment
  ? import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api"
  : "/api"; // 배포 환경에서는 상대 경로 사용 (Netlify Functions로 라우팅됨)

export const api = axios.create({
  baseURL,
  timeout: 15000, // 자막 추출에 시간이 걸릴 수 있으므로 타임아웃 여유있게 설정
  headers: {
    "Content-Type": "application/json",
  },
});

// 필요시 인터셉터 추가
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 에러 처리 로직
    console.error("API 요청 실패:", error);
    return Promise.reject(error);
  }
);

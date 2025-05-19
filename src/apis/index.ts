import axios from "axios";

// API base URL 환경변수 또는 기본값 사용
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api",
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

import axios from "axios";

// API base URL 환경변수 사용
export const api = axios.create({
  baseURL: "http://localhost:4000/",
  timeout: 15000, // 자막 추출에 시간이 걸릴 수 있으므로 타임아웃 여유있게 설정
  headers: {
    "Content-Type": "application/json",
  },
});

import axios from "axios";

// API base URL을 /api로 설정하여 모든 요청에 /api 프리픽스가 자동으로 추가되도록 함
export const api = axios.create({
  baseURL: "/api",
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

    // 에러 응답이 있는 경우 에러 메시지 추출
    const errorMessage =
      error.response?.data?.message ||
      error.message ||
      "서버 연결에 실패했습니다.";

    return Promise.reject(new Error(errorMessage));
  }
);

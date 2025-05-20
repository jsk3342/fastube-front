import { Request, Response, NextFunction } from "express";

// 에러 인터페이스 정의
export interface AppError extends Error {
  statusCode?: number;
  data?: any;
}

// 404 에러 처리 미들웨어
export const notFoundMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const error = new Error(
    `요청한 경로 ${req.originalUrl}를 찾을 수 없습니다.`
  ) as AppError;
  error.statusCode = 404;
  next(error);
};

// 글로벌 에러 핸들러
export const errorHandlerMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;

  console.error(
    `[${req.method}] ${req.path} >> StatusCode:: ${statusCode}, Message:: ${err.message}`
  );

  res.status(statusCode).json({
    success: false,
    message: err.message || "서버에 오류가 발생했습니다.",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    data: err.data,
  });
};

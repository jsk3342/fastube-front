FROM node:20-alpine AS build

WORKDIR /app

# 의존성 설치를 위한 파일만 먼저 복사 (캐싱 최적화)
COPY package.json package-lock.json ./
RUN npm ci --silent

# 소스 파일 복사
COPY . .

# 빌드
RUN npm run build

# 실행 단계 - 프로덕션 의존성만 설치
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --only=production --silent
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main.js"]

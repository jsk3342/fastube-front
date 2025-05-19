FROM node:20-alpine AS build

WORKDIR /app

# 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm install

# 소스 파일 복사
COPY . .

# 환경변수 설정 - 프로덕션 빌드시에는 .env.production의 값이 사용됨
# ENV 값은 필요하지 않음 (Vite가 자동으로 .env.production 파일 사용)

# 빌드
RUN npm run build

# Nginx 이미지로 배포
FROM nginx:alpine

# 빌드된 파일 복사
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx 설정
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 
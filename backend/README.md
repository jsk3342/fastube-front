# Fastube 백엔드

YouTube 자막과 비디오 정보를 가져오기 위한 RESTful API 서버입니다.

## 기능

- YouTube 비디오 URL에서 자막 추출
- 자막 데이터 형식 변환 및 HTML 엔티티 디코딩
- 비디오 정보 조회
- Swagger API 문서 제공
- 헬스체크 엔드포인트

## 시작하기

### 요구사항

- Node.js 14 이상
- npm 6 이상

### 설치

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

## API 엔드포인트

### 헬스체크

```
GET /api/health
```

### API 문서 (Swagger)

```
GET /api/docs
```

### 자막 가져오기

```
POST /api/subtitles
```

요청 바디:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "ko"
}
```

### 비디오 정보 가져오기

```
GET /api/video/info?id=VIDEO_ID
```

## 배포

AWS EC2 인스턴스에 Nginx와 PM2를 사용하여 배포할 수 있습니다.

```bash
# 배포 스크립트 실행
chmod +x deploy.sh
./deploy.sh
```

## 환경 변수

`.env` 파일을 통해 다음 환경 변수를 설정할 수 있습니다:

- `PORT`: 서버 포트 (기본값: 4000)
- `NODE_ENV`: 환경 설정 (development, production)
- `API_PREFIX`: API 경로 프리픽스 (기본값: /api)
- `CORS_ORIGIN`: CORS 허용 출처 (기본값: http://localhost:5173)

## 구조

```
├── src/
│   ├── app.ts             # Express 앱 설정
│   ├── index.ts           # 서버 시작점
│   ├── config/            # 환경 설정
│   ├── controllers/       # 컨트롤러 레이어
│   ├── docs/              # Swagger 문서 설정
│   ├── middlewares/       # 미들웨어
│   ├── models/            # 데이터 모델
│   ├── routes/            # API 라우트
│   ├── services/          # 비즈니스 로직
│   └── utils/             # 유틸리티 함수
├── dist/                  # 빌드 결과물
├── .env                   # 환경 변수
├── nginx.conf             # Nginx 설정
├── deploy.sh              # 배포 스크립트
└── tsconfig.json          # TypeScript 설정
```

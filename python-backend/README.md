# Fastube Python 백엔드

YouTube 자막을 추출하는 Python 기반 백엔드 API 서버입니다.
Node.js 기반 서버에서 봇 감지 문제를 해결하기 위해 yt-dlp 라이브러리를 사용하여 구현했습니다.

## 설치 방법

### 필요 요구사항

- Python 3.8 이상
- pip (Python 패키지 관리자)

### 설치 단계

1. 필요한 패키지 설치:

```bash
pip install -r requirements.txt
```

2. yt-dlp 명령어가 시스템에 설치되어 있는지 확인:

```bash
yt-dlp --version
```

만약 설치되어 있지 않다면:

```bash
pip install yt-dlp
```

## 실행 방법

프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다:

```bash
python run.py
```

서버는 기본적으로 `http://localhost:4000`에서 실행됩니다.

## API 엔드포인트

### 자막 추출

```
POST /api/subtitles
```

**요청 본문**:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "ko"
}
```

**응답**:

```json
{
  "success": true,
  "data": {
    "text": "자막 텍스트...",
    "subtitles": [],
    "videoInfo": {
      "title": "비디오 제목",
      "channelName": "채널명",
      "thumbnailUrl": "썸네일 URL",
      "videoId": "VIDEO_ID"
    }
  }
}
```

### 비디오 정보 가져오기

```
GET /api/video/info?id=VIDEO_ID
```

**응답**:

```json
{
  "success": true,
  "data": {
    "title": "비디오 제목",
    "channelName": "채널명",
    "thumbnailUrl": "썸네일 URL",
    "duration": 300,
    "availableLanguages": [
      { "code": "ko", "name": "한국어" },
      { "code": "en", "name": "영어" }
    ],
    "videoId": "VIDEO_ID"
  }
}
```

## 주요 기능

1. **봇 감지 우회**: yt-dlp 라이브러리를 사용하여 YouTube의 봇 감지를 우회합니다.
2. **다양한 추출 방식**: API 방식과 파일 기반 방식으로 자막을 추출합니다.
3. **자동 생성 자막 지원**: 일반 자막이 없는 경우 자동 생성 자막도 추출합니다.
4. **다국어 지원**: 다양한 언어의 자막을 추출할 수 있습니다.

## 파일 구조

```
python-backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 앱과 라우트
│   ├── services/
│   │   ├── __init__.py
│   │   └── subtitle_service.py  # 자막 처리 서비스
│   └── utils/
│       ├── __init__.py
│       └── youtube_utils.py     # YouTube 관련 유틸리티
├── requirements.txt         # 필요한 패키지
├── run.py                   # 실행 스크립트
└── README.md                # 이 파일
```

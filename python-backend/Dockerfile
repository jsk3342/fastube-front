# 베이스 이미지로 Python 3.11 사용
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 설치 (필요한 경우)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    tor \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 파일 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 환경 변수 설정
ENV PORT=8000

# Tor 서비스 자동 시작 설정
RUN mkdir -p /var/run/tor && chown -R debian-tor:debian-tor /var/run/tor

# 컨테이너 실행 명령 설정
CMD service tor start && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
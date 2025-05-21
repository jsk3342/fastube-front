FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    python3-dev \
    tor \
    curl \
    gnupg2 \
    procps \
    netcat-traditional \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# CA 인증서 업데이트 및 SSL 관련 설정
RUN update-ca-certificates

# Python 환경변수 설정 - SSL 인증서 검증 비활성화 (보안 주의)
ENV PYTHONHTTPSVERIFY=0
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# 파이썬 요구사항 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright 설치 (필요한 경우만 해제)
# RUN pip install playwright && python -m playwright install --with-deps chromium

# 애플리케이션 코드 복사
COPY . .

# 컨테이너 실행 시 Tor 서비스 시작하고 API 실행
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"] 
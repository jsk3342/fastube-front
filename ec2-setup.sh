#!/bin/bash
# EC2 서버 초기 설정 스크립트

# 1. 필요한 패키지 설치
echo "필요한 패키지 설치 중..."
sudo apt update
sudo apt install -y docker.io docker-compose git

# 2. Docker 서비스 시작 및 활성화
echo "Docker 서비스 시작 및 활성화 중..."
sudo systemctl start docker
sudo systemctl enable docker

# 3. 사용자에게 Docker 권한 부여
echo "사용자에게 Docker 권한 부여 중..."
sudo usermod -aG docker ubuntu
newgrp docker

# 4. 프로젝트 디렉토리 생성
echo "프로젝트 디렉토리 생성 중..."
mkdir -p ~/fastube-docker

echo "=== EC2 서버 초기 설정 완료 ==="
echo "이제 GitHub Actions에서 지정한 저장소와 SSH 키를 사용하여 자동 배포가 가능합니다." 
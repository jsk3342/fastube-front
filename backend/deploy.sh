#!/bin/bash

# 에러 발생 시 스크립트 종료
set -e

echo "===== Fastube 배포 스크립트 시작 ====="

# 루트 디렉토리 설정
ROOT_DIR="/var/www/fastube"

# 백엔드 배포
echo "===== 백엔드 빌드 및 배포 ====="
cd $ROOT_DIR/backend
npm install
npm run build

# PM2로 백엔드 서버 재시작
if pm2 list | grep -q "fastube-backend"; then
  echo "백엔드 서버 재시작..."
  pm2 restart fastube-backend
else
  echo "백엔드 서버 최초 시작..."
  pm2 start dist/index.js --name fastube-backend
fi

# 프론트엔드 배포
echo "===== 프론트엔드 빌드 및 배포 ====="
cd $ROOT_DIR/frontend
npm install
npm run build:prod

# Nginx 설정 복사 및 재시작
echo "===== Nginx 설정 및 재시작 ====="
sudo cp $ROOT_DIR/backend/nginx.conf /etc/nginx/sites-available/fastube.conf
sudo ln -sf /etc/nginx/sites-available/fastube.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

echo "===== 배포 완료 =====" 
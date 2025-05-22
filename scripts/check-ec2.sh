#!/bin/bash

# EC2 접속 정보
KEY_PATH="~/Downloads/fastube.pem"
EC2_USER="ubuntu"
EC2_HOST="13.209.41.149"

# EC2 상태 확인
echo "===== EC2 인스턴스 상태 확인 ====="
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST "date && hostname && uptime"
echo ""

# 디렉토리 확인
echo "===== fastube-docker 디렉토리 확인 ====="
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST "ls -la ~/fastube-docker"
echo ""

# Git 상태 확인
echo "===== Git 저장소 상태 확인 ====="
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST "cd ~/fastube-docker && git status && git log -1"
echo ""

# Docker 상태 확인
echo "===== Docker 상태 확인 ====="
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST "sudo docker ps -a"
echo ""

# Docker Compose 상태 확인
echo "===== Docker Compose 상태 확인 ====="
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST "cd ~/fastube-docker && sudo docker-compose ps" 
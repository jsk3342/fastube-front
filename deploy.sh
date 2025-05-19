#!/bin/bash
set -e

# EC2 인스턴스 확인
echo "EC2 접속 확인 중..."
ssh -i ~/Downloads/fastube.pem ubuntu@ec2-13-209-41-149.ap-northeast-2.compute.amazonaws.com 'echo "접속 성공"'

# 먼저 기존 사용 중인 80 포트 확인
echo "포트 사용 상태 확인 중..."
ssh -i ~/Downloads/fastube.pem ubuntu@ec2-13-209-41-149.ap-northeast-2.compute.amazonaws.com '
  echo "현재 포트 80 사용 중인 프로세스:"
  sudo lsof -i :80
  
  # 기존 Nginx 중지 (기본 설치된 Nginx가 있을 경우)
  sudo systemctl stop nginx || true
  
  # 도커 정리 (기존 컨테이너 제거)
  cd ~/fastube-docker
  docker-compose down || true
  docker rm -f $(docker ps -a -q --filter name=fastube) || true
'

# 필요한 파일만 압축 (node_modules 제외)
echo "파일 압축 중..."
tar --exclude="*/node_modules" --exclude="*/dist" -czf fastube.tar.gz frontend backend docker-compose.yml

# EC2로 전송
echo "EC2로 파일 전송 중..."
scp -i ~/Downloads/fastube.pem fastube.tar.gz ubuntu@ec2-13-209-41-149.ap-northeast-2.compute.amazonaws.com:~/fastube-docker/

# EC2에서 도커 이미지 빌드 및 실행
echo "EC2에서 도커 컨테이너 실행 중..."
ssh -i ~/Downloads/fastube.pem ubuntu@ec2-13-209-41-149.ap-northeast-2.compute.amazonaws.com '
  cd ~/fastube-docker && 
  tar xzf fastube.tar.gz &&
  echo "Docker 이미지 빌드 및 실행..." &&
  docker-compose up -d --build &&
  rm fastube.tar.gz &&
  echo "배포 완료!"
'

# 로컬 임시 파일 삭제
rm fastube.tar.gz

echo "배포 완료: http://13.209.41.149"

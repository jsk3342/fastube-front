# GitHub Actions 배포 가이드

## 사전 준비사항

1. GitHub 저장소가 설정되어 있어야 합니다.
2. EC2 인스턴스에 Docker와 Docker Compose가 설치되어 있어야 합니다.

## GitHub Secrets 설정 방법

### SSH 개인 키 등록하기

1. GitHub 저장소로 이동하여 `Settings` 탭을 클릭합니다.
2. 왼쪽 메뉴에서 `Secrets and variables` → `Actions`를 클릭합니다.
3. `New repository secret` 버튼을 클릭합니다.
4. 다음 정보를 입력합니다:
   - Name: `SSH_PRIVATE_KEY`
   - Value: `~/Downloads/fastube.pem` 파일의 내용을 복사하여 붙여넣기
     ```bash
     # 파일 내용 확인 방법
     cat ~/Downloads/fastube.pem
     ```
5. `Add secret` 버튼을 클릭하여 저장합니다.

## 코드 푸시하기

GitHub Actions 설정이 완료되면, 코드를 푸시하여 자동 배포를 시작할 수 있습니다:

```bash
git add .
git commit -m "Add GitHub Actions deployment"
git push origin main
```

## 배포 모니터링

1. GitHub 저장소의 `Actions` 탭에서 배포 진행 상황을 확인할 수 있습니다.
2. 각 워크플로우 실행에 대한 자세한 로그를 볼 수 있습니다.

## 문제 해결

- SSH 접속 에러: SSH 키가 올바르게 등록되었는지 확인하세요.
- Git 클론 에러: 저장소 URL이 올바른지 확인하세요.
- Docker 명령어 에러: EC2 인스턴스에 Docker가 설치되어 있는지 확인하세요.

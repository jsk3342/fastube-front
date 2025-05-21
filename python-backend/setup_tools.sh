#!/bin/bash

echo "🔧 YouTube 자막 추출 도구 설치 스크립트"
echo "---------------------------------------"

# 필요한 파이썬 패키지 설치
echo "📦 필요한 파이썬 패키지 설치 중..."
pip install undetected-chromedriver playwright yt-dlp pysocks beautifulsoup4 lxml aiohttp requests --upgrade

# Playwright 브라우저 설치
echo "🌐 Playwright 브라우저 설치 중..."
python -m playwright install chromium

# Tor 설치 여부 확인
command -v tor >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️ Tor가 설치되어 있지 않습니다."
    echo "Tor를 설치하시겠습니까? (y/n)"
    read -r install_tor
    if [ "$install_tor" = "y" ]; then
        # 운영체제 확인 및 Tor 설치
        if [ "$(uname)" == "Darwin" ]; then
            # macOS
            echo "🍎 macOS에 Tor 설치 중..."
            if command -v brew >/dev/null 2>&1; then
                brew install tor
                brew services start tor
            else
                echo "❌ Homebrew가 설치되어 있지 않습니다. https://brew.sh/ 에서 설치하세요."
            fi
        elif [ "$(uname)" == "Linux" ]; then
            # Linux
            echo "🐧 Linux에 Tor 설치 중..."
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update
                sudo apt-get install -y tor
                sudo service tor start
            elif command -v yum >/dev/null 2>&1; then
                sudo yum install -y tor
                sudo systemctl start tor
            else
                echo "❌ 지원되지 않는 Linux 배포판입니다."
                echo "수동으로 Tor를 설치하세요: https://www.torproject.org/download/"
            fi
        else
            # Windows or other
            echo "❌ 자동 설치가 지원되지 않는 운영체제입니다."
            echo "수동으로 Tor를 설치하세요: https://www.torproject.org/download/"
        fi
    fi
else
    echo "✅ Tor가 이미 설치되어 있습니다."
    # Tor 서비스 시작
    if [ "$(uname)" == "Darwin" ]; then
        # macOS
        if command -v brew >/dev/null 2>&1; then
            echo "🔄 Tor 서비스 재시작 중..."
            brew services restart tor
        else
            echo "❌ Homebrew가 설치되어 있지 않습니다."
        fi
    elif [ "$(uname)" == "Linux" ]; then
        # Linux
        if command -v systemctl >/dev/null 2>&1; then
            echo "🔄 Tor 서비스 재시작 중..."
            sudo systemctl restart tor
        elif command -v service >/dev/null 2>&1; then
            echo "🔄 Tor 서비스 재시작 중..."
            sudo service tor restart
        fi
    fi
fi

# Tor 연결 테스트
echo "🧪 Tor 연결 테스트 중..."
curl --socks5 127.0.0.1:9050 --socks5-hostname 127.0.0.1:9050 -s https://check.torproject.org/ | grep -q "Congratulations"
if [ $? -eq 0 ]; then
    echo "✅ Tor 연결 성공! 현재 Tor 네트워크를 통해 연결되어 있습니다."
else
    echo "❌ Tor 연결 실패. Tor 서비스가 실행 중인지 확인하세요."
    echo "수동으로 Tor 서비스를 시작하려면:"
    echo "  macOS: brew services start tor"
    echo "  Linux (systemd): sudo systemctl start tor"
    echo "  Linux (init.d): sudo service tor start"
fi

echo "---------------------------------------"
echo "✅ 설치 완료! 이제 서버를 실행하세요:"
echo "   cd python-backend && uvicorn app.main:app --reload" 
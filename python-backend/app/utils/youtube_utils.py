"""
YouTube 자막 추출 및 비디오 정보 가져오기 유틸리티 함수
"""
import re
import logging
from typing import Dict, List, Optional, Any, Tuple, Set, Union
import yt_dlp
import random
import time
import os
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from youtube_transcript_api import YouTubeTranscriptApi, _errors
import asyncio
import aiohttp
from playwright.async_api import async_playwright
import io
import tempfile
import subprocess
from concurrent.futures import ThreadPoolExecutor
import traceback
from .subtitle_utils import process_subtitles, convert_transcript_api_format

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("youtube_utils")

# 환경 감지
RUNNING_IN_CONTAINER = os.path.exists('/.dockerenv') or os.path.exists('/app')
logger.info(f"컨테이너 환경에서 실행 중: {RUNNING_IN_CONTAINER}")

# 전역 변수
last_request_time = 0
min_request_interval = 5  # 초 단위
USE_BROWSER_FIRST = False  # Playwright 브라우저를 우선적으로 사용
USE_BROWSER_FALLBACK = True  # yt-dlp 실패 시 Playwright 폴백 사용 여부
USE_YTDLP_COOKIES = True  # yt-dlp에 쿠키 사용 여부
# Tor 네트워크는 기본적으로 활성화 (컨테이너 환경에서도 동일하게)
USE_TOR_NETWORK = True  # Tor 네트워크 사용 활성화
TOR_PROXY = "socks5://127.0.0.1:9050"  # Tor 프록시 주소 (기본값)
USE_PROXIES = False if RUNNING_IN_CONTAINER else True  # 프록시 사용 여부 - 컨테이너에서는 비활성화

# 프록시 관련 상수
MAX_WORKERS = 10  # 프록시 테스트용 최대 워커 수
BLACKLISTED_PROXY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "blacklisted_proxies.txt")
WORKING_PROXY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "working_proxies.txt")
# 쿠키 파일 경로 설정
cookies_file = os.path.join(os.path.dirname(__file__), "..", "data", "youtube_cookies.txt")

# 필요한 디렉토리 생성
os.makedirs(os.path.dirname(BLACKLISTED_PROXY_PATH), exist_ok=True)
os.makedirs(os.path.dirname(WORKING_PROXY_PATH), exist_ok=True)
os.makedirs(os.path.dirname(cookies_file), exist_ok=True)


class FreeProxyManager:
    """
    무료 HTTP 프록시를 관리하는 클래스입니다.
    작동하는 프록시 목록을 관리하고, 블랙리스트를 유지합니다.
    싱글톤 패턴으로 구현되어 있어 하나의 인스턴스만 존재합니다.
    """
    _instance = None
    blacklist_file_path = BLACKLISTED_PROXY_PATH
    working_proxies_file_path = WORKING_PROXY_PATH
    
    # 한 번에 테스트할 최대 프록시 수 (성능 최적화)
    MAX_PROXIES_TO_TEST = 5
    
    # 이미 테스트된 프록시 목록
    tested_proxies = set()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FreeProxyManager, cls).__new__(cls)
            cls._instance.proxies = cls._instance.load_working_proxies()
            cls._instance.blacklist = cls._instance.load_blacklist()
            cls._instance.untested_proxies = []  # 테스트되지 않은 프록시 목록
        return cls._instance

    def load_blacklist(self):
        """블랙리스트에 등록된 프록시 목록을 로드합니다."""
        try:
            with open(self.blacklist_file_path, "r") as file:
                return set(line.strip() for line in file if line.strip())
        except FileNotFoundError:
            return set()

    def save_blacklist(self):
        """블랙리스트를 파일에 저장합니다."""
        with open(self.blacklist_file_path, "w") as file:
            for proxy in self.blacklist:
                file.write(proxy + "\n")

    def load_working_proxies(self):
        """작동하는 프록시 목록과 응답 시간을 로드합니다."""
        try:
            with open(self.working_proxies_file_path, "r") as file:
                return [
                    (line.strip().split(",")[0], float(line.strip().split(",")[1]))
                    for line in file
                    if line.strip() and "," in line.strip()
                ]
        except (FileNotFoundError, ValueError, IndexError):
            return []

    def save_working_proxies(self):
        """작동하는 프록시 목록을 파일에 저장합니다."""
        with open(self.working_proxies_file_path, "w") as file:
            for proxy, time_taken in self.proxies:
                file.write(f"{proxy},{time_taken}\n")

    def fetch_proxy_list(self, url="https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt"):
        """
        무료 프록시 목록을 가져오고 테스트를 위해 대기열에 추가합니다.
        프록시 테스트는 시간이 많이 걸리므로 백그라운드에서 점진적으로 수행합니다.
        """
        try:
            logger.info("프록시 목록 가져오기 시작...")
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                # 프록시 목록 파싱
                proxies = response.text.strip().split('\n')
                logger.info(f"{len(proxies)}개의 프록시 찾음")
                
                # 이미 블랙리스트에 있는 프록시 제외
                filtered_proxies = [p for p in proxies if p not in self.blacklist]
                logger.info(f"{len(filtered_proxies)}개의 프록시 테스트 예정 (블랙리스트 제외)")
                
                # 테스트할 프록시 대기열 설정 (테스트는 필요할 때만 수행)
                self.untested_proxies = filtered_proxies
                
                # 간단한 건강 검사만 수행 (실제 테스트는 필요할 때 수행)
                return True
            else:
                logger.error(f"프록시 목록 가져오기 실패: HTTP {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"프록시 목록 가져오기 오류: {str(e)}")
            return False

    def test_proxy_batch(self):
        """
        프록시 배치를 테스트합니다.
        작은 배치로 나누어 테스트하여 시스템 부하를 최소화합니다.
        """
        if not hasattr(self, 'untested_proxies') or not self.untested_proxies:
            logger.info("테스트할 프록시 없음. 새 프록시 목록을 가져옵니다.")
            self.fetch_proxy_list()
            if not self.untested_proxies:
                return False
        
        # 작은 배치만 테스트
        batch_size = min(self.MAX_PROXIES_TO_TEST, len(self.untested_proxies))
        batch = self.untested_proxies[:batch_size]
        self.untested_proxies = self.untested_proxies[batch_size:]
        
        if not batch:
            logger.warning("테스트할 프록시 배치 없음")
            return False
        
        logger.info(f"{len(batch)}개 프록시 테스트 중...")
        
        # 적은 수의 작업자로 병렬 테스트 (자원 사용 최소화)
        max_workers = min(3, len(batch))  # 최대 3개 작업자만 사용
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 프록시 테스트 결과 처리
            results = list(executor.map(self._test_proxy, batch))
            
            # 작동하는 프록시 추가
            working_proxies = [proxy for proxy, is_working in zip(batch, results) if is_working]
            if working_proxies:
                self.proxies.extend([(proxy, time.time()) for proxy in working_proxies])
                logger.info(f"{len(working_proxies)}개의 새 작동 프록시 추가됨")
                self.save_working_proxies()
            
            # 테스트된 프록시 표시
            self.tested_proxies.update(batch)
            
            return len(working_proxies) > 0

    def update_proxy_list(self):
        """
        프록시 목록을 업데이트합니다.
        처음에는 작은 배치만 테스트하고, 나머지는 필요할 때 테스트합니다.
        """
        # 프록시 가져오기
        if not hasattr(self, 'untested_proxies') or not self.untested_proxies:
            self.fetch_proxy_list()
        
        # 처음에는 작은 배치만 테스트 (최대 5개)
        self.test_proxy_batch()
        
        # 로깅
        logger.info(f"사용 가능한 프록시: {len(self.proxies)}개")
        return len(self.proxies) > 0

    def get_proxy(self):
        """
        가장 빠른 응답 시간을 가진 프록시를 반환합니다.
        필요한 경우 추가 프록시를 테스트합니다.
        """
        # 작동하는 프록시가 없으면 소량 테스트
        if not self.proxies:
            logger.info("작동하는 프록시가 없습니다. 소량 테스트를 시작합니다.")
            self.test_proxy_batch()
            
        if self.proxies:
            # 가장 빠른 프록시 사용 (정렬된 목록의 첫 번째)
            fastest_proxy, fastest_time = self.proxies[0]
            logger.info(f"가장 빠른 프록시 사용: {fastest_proxy} (응답 시간: {fastest_time:.2f}초)")
            return {
                "http": f"http://{fastest_proxy}",
                "https": f"http://{fastest_proxy}",
            }
        else:
            logger.warning("작동하는 프록시를 찾을 수 없습니다.")
            return None

    def get_random_proxy(self):
        """
        가중치 기반으로 랜덤 프록시를 선택합니다.
        필요한 경우 추가 프록시를 테스트합니다.
        """
        # 작동하는 프록시가 없으면 소량 테스트
        if not self.proxies:
            logger.info("작동하는 프록시가 없습니다. 소량 테스트를 시작합니다.")
            self.test_proxy_batch()
            
        if self.proxies:
            # 단순 랜덤 선택 (가중치 계산은 비용이 큼)
            selected_proxy, _ = random.choice(self.proxies)
            logger.info(f"랜덤 프록시 선택: {selected_proxy}")
            return {
                "http": f"http://{selected_proxy}",
                "https": f"http://{selected_proxy}",
            }
        else:
            logger.warning("작동하는 프록시를 찾을 수 없습니다.")
            return None

    def remove_and_update_proxy(self, non_functional_proxy):
        """
        작동하지 않는 프록시를 제거하고 블랙리스트에 추가합니다.
        필요한 경우 추가 프록시를 테스트합니다.
        """
        # 프록시 주소 추출 (일관된 처리를 위해)
        if isinstance(non_functional_proxy, dict) and "http" in non_functional_proxy:
            non_functional_proxy_address = non_functional_proxy["http"].split("//")[1]
        elif isinstance(non_functional_proxy, str):
            non_functional_proxy_address = non_functional_proxy.replace("http://", "").replace("https://", "")
        else:
            logger.error(f"잘못된 프록시 형식: {non_functional_proxy}")
            return

        # 작동하지 않는 프록시 제거 및 블랙리스트 업데이트
        self.proxies = [
            proxy for proxy in self.proxies if proxy[0] != non_functional_proxy_address
        ]
        self.blacklist.add(non_functional_proxy_address)
        self.tested_proxies.add(non_functional_proxy_address)
        self.save_blacklist()
        self.save_working_proxies()
        logger.info(f"작동하지 않는 프록시 제거: {non_functional_proxy_address}")

        # 프록시 수가 적으면 추가 배치 테스트
        if len(self.proxies) < 3:
            logger.info("프록시 수가 부족합니다. 추가 배치 테스트 시작...")
            self.test_proxy_batch()

    def _test_proxy(self, proxy):
        """
        단일 프록시를 테스트합니다.
        빠른 테스트를 위해 타임아웃을 짧게 설정합니다.
        """
        try:
            http_proxy = f"http://{proxy}"
            proxies = {
                "http": http_proxy,
                "https": http_proxy
            }
            
            # 간단한 테스트 URL (빠른 응답)
            test_url = "http://www.google.com"
            
            # 짧은 타임아웃으로 빠른 확인
            response = requests.get(
                test_url, 
                proxies=proxies, 
                timeout=3.0,  # 3초 타임아웃 (더 빠른 테스트)
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36"}
            )
            
            # 응답 상태 확인
            return response.status_code == 200
        
        except Exception as e:
            # 실패한 프록시 무시 (로깅하지 않음)
            return False


# 프록시 매니저 인스턴스 생성
proxy_manager = FreeProxyManager()

def get_random_proxy():
    """
    랜덤 프록시를 반환합니다.
    작동하는 프록시가 없으면 None을 반환합니다.
    참고: 이 함수는 30% 확률로 프록시를 사용하지 않도록 None을 반환할 수 있습니다.
    """
    if not USE_PROXIES or random.random() < 0.3:  # 30% 확률로 프록시 사용하지 않음
        return None
    
    try:
        proxy_manager = FreeProxyManager()
        return proxy_manager.get_proxy()
    except Exception as e:
        logger.warning(f"프록시 가져오기 실패: {str(e)}")
        return None

def extract_video_id(url: str) -> Optional[str]:
    """
    YouTube URL에서 비디오 ID를 추출합니다.
    """
    patterns = [
        r'youtu\.be\/([^\/\?&]+)',
        r'youtube\.com\/watch\?v=([^\/\?&]+)',
        r'youtube\.com\/embed\/([^\/\?&]+)',
        r'youtube\.com\/v\/([^\/\?&]+)',
        r'youtube\.com\/.*\?.*v=([^\/\?&]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    return None

def get_video_info(video_id: str, max_retries=3) -> Dict[str, Any]:
    """
    YouTube 비디오 정보를 가져옵니다.
    """
    global last_request_time
    
    # 요청 간격 관리
    current_time = time.time()
    time_since_last_request = current_time - last_request_time
    
    if time_since_last_request < min_request_interval:
        wait_time = min_request_interval - time_since_last_request + random.uniform(0.5, 2.0)
        logger.info(f"요청 빈도 제한: {wait_time:.2f}초 대기")
        time.sleep(wait_time)
    
    # 인간 행동 시뮬레이션을 위한 랜덤 지연
    time.sleep(random.uniform(1.0, 3.0))
    
    logger.info(f"비디오 정보 가져오기 시작: {video_id}")
    
    for attempt in range(max_retries):
        try:
            # 요청마다 다른 브라우저 지문 사용
            user_agent = get_random_browser_fingerprint()
            
            # 헤더 랜덤화
            http_headers = get_random_headers()
            
            # 쿠키 설정
            cookie_file = None
            if random.random() > 0.3:  # 70% 확률로 쿠키 사용
                cookie_file = f"yt_cookies_{random.randint(1, 5)}.txt"
                if not os.path.exists(cookie_file):
                    with open(cookie_file, 'w') as f:
                        f.write(create_youtube_cookies())
            
            # 다운로드 옵션 설정
            ydl_opts = {
                'skip_download': True,
                'quiet': True,
                'no_warnings': True,
                'user_agent': user_agent,
                'http_headers': http_headers,
            }
            
            # 쿠키 파일 사용 설정
            if cookie_file:
                ydl_opts['cookiefile'] = cookie_file
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                
                # 임시 쿠키 파일 삭제
                if cookie_file and os.path.exists(cookie_file) and random.random() > 0.5:
                    try:
                        os.remove(cookie_file)
                    except:
                        pass
                
                # 필요한 정보만 추출
                video_info = {
                    'title': info.get('title', f"Video {video_id}"),
                    'channelName': info.get('uploader', "Unknown"),
                    'thumbnailUrl': info.get('thumbnail', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                    'duration': info.get('duration', 0),
                    'availableLanguages': get_available_languages(info),
                    'videoId': video_id
                }
                
                logger.info(f"비디오 정보 가져오기 성공: {video_info['title']}")
                # 요청 시간 업데이트
                last_request_time = time.time()
                return video_info
        
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"시도 {attempt+1}/{max_retries} 실패: {error_msg}")
            
            if "HTTP Error 429" in error_msg:  # 너무 많은 요청
                wait_time = (2 ** attempt) * 10  # 지수 백오프
                logger.info(f"{wait_time}초 대기 후 재시도합니다...")
                time.sleep(wait_time)
            elif attempt < max_retries - 1:
                time.sleep(random.uniform(2, 5))  # 일반 오류 시 짧은 대기
            else:
                # 요청 실패 시 기본 정보 반환
                logger.error(f"비디오 정보 가져오기 실패: {str(e)}")
                return {
                    'title': f"Video {video_id}",
                    'channelName': "Unknown Channel",
                    'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                    'duration': 0,
                    'availableLanguages': [],
                    'videoId': video_id
                }
    
    # 최대 재시도 횟수 초과
    return {
        'title': f"Video {video_id}",
        'channelName': "Unknown Channel",
        'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        'duration': 0,
        'availableLanguages': [],
        'videoId': video_id
    }

def get_available_languages(video_info: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    비디오에서 사용 가능한 자막 언어 목록을 추출합니다.
    """
    languages = []
    
    try:
        # yt-dlp의 자막 정보 구조에 따라 추출
        if 'subtitles' in video_info and video_info['subtitles']:
            for lang_code, subtitles in video_info['subtitles'].items():
                lang_name = get_language_name(lang_code)
                languages.append({
                    'code': lang_code,
                    'name': lang_name
                })
                
        # 자동 생성 자막 확인
        if 'automatic_captions' in video_info and video_info['automatic_captions']:
            for lang_code, subtitles in video_info['automatic_captions'].items():
                # 자동 생성 자막은 이미 목록에 없는 경우만 추가
                if not any(lang['code'] == lang_code for lang in languages):
                    lang_name = get_language_name(lang_code)
                    languages.append({
                        'code': lang_code,
                        'name': f"자동 생성: {lang_name}"
                    })
    
    except Exception as e:
        logger.error(f"자막 언어 목록 추출 실패: {str(e)}")
    
    return languages

def get_language_name(lang_code: str) -> str:
    """
    언어 코드에 해당하는 언어 이름을 반환합니다.
    """
    language_map = {
        'ko': '한국어',
        'en': '영어',
        'ja': '일본어',
        'zh': '중국어',
        'zh-Hans': '중국어 간체',
        'zh-Hant': '중국어 번체',
        'fr': '프랑스어',
        'de': '독일어',
        'es': '스페인어',
        'ru': '러시아어',
        'it': '이탈리아어',
        'pt': '포르투갈어',
        'ar': '아랍어',
        'th': '태국어',
        'vi': '베트남어',
        'id': '인도네시아어',
    }
    
    # 기본 언어 코드 (하이픈 앞까지)
    base_code = lang_code.split('-')[0]
    
    # 정확한 매칭이 있으면 그것을 반환, 아니면 기본 코드로 시도
    return language_map.get(lang_code, language_map.get(base_code, lang_code))

def setup_yt_auth(use_auth=False):
    """
    YouTube 인증 설정 (선택적)
    """
    # 인증 사용 시에만 적용
    if not use_auth:
        return {}
        
    # 실제 사용 시에는 여기에 YouTube 계정 토큰 또는 쿠키를 
    # 안전하게 관리하고 추가하는 코드를 구현해야 함
    # 주의: 민감한 인증 정보는 암호화하여 저장
    
    # 예시 (실제 작동하는 코드 아님)
    return {
        'cookiefile': 'auth_cookies.txt',
    }

async def get_subtitles(video_id: str, language: str, max_retries=1, use_auth=False) -> Tuple[bool, Dict[str, Any]]:
    """
    지정된 언어로 YouTube 비디오의 자막을 가져옵니다.
    성능 향상을 위해 우선적으로 YouTube Transcript API를 사용하고,
    실패하면 Tor 네트워크를 통한 yt-dlp 방식을 시도합니다.
    이미 응답을 반환한 경우 추가 시도를 하지 않습니다.
    """
    global last_request_time
    response_sent = False
    
    # 최적화: 비디오 URL 생성 및 로깅
    url = f"https://www.youtube.com/watch?v={video_id}"
    logger.info(f"자막 추출 시작 - 비디오 ID: {video_id}, 언어: {language}")
    
    # 비디오 정보 가져오기 - 시간 단축을 위해 별도 스레드에서 실행
    video_info = {
        'title': "Unknown",
        'channelName': "Unknown",
        'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        'videoId': video_id
    }
    
    try:
        # 비동기로 비디오 정보 가져오기 시도 (최대 2초 타임아웃)
        video_info_future = asyncio.create_task(asyncio.to_thread(get_video_info_minimal, video_id))
        try:
            video_info_result = await asyncio.wait_for(video_info_future, timeout=2.0)
            if video_info_result:
                video_info = video_info_result
                logger.info(f"비디오 정보 가져오기 성공: {video_info['title']}")
        except asyncio.TimeoutError:
            logger.warning("비디오 정보 가져오기 타임아웃, 기본 정보 사용")
    except Exception as e:
        logger.error(f"비디오 정보 가져오기 예외 발생: {str(e)}, 기본 정보 사용")
    
    # 추출 방법: 1) YouTube Transcript API
    extraction_methods = [
        {
            "name": "YouTube Transcript API",
            "func": extract_subtitles_with_transcript_api,
            "args": [video_id, language, video_info]
        }
    ]
    
    # 오류 정보 수집
    errors = {}
    
    # 각 메서드를 순차적으로 시도
    for method in extraction_methods:
        if response_sent:
            break
            
        method_name = method["name"]
        func = method["func"]
        args = method["args"]
        
        try:
            # 함수 호출 방식에 따라 실행
            success, result = func(*args)
            
            if success:
                logger.info(f"방법 '{method_name}'으로 자막 추출 성공")
                response_sent = True
                
                # 자막 데이터가 있는 경우 서브타이틀 처리
                if 'data' in result and 'text' in result['data']:
                    # 서브타이틀 처리: 자막 형식에 따라 적절히 처리
                    subtitle_text = result['data']['text']
                    format_type = "text"
                    
                    # 형식 검사
                    if subtitle_text.startswith('<?xml'):
                        format_type = "xml"
                    elif subtitle_text.startswith('{'):
                        format_type = "json"
                        
                    # 서브타이틀 처리 및 반환
                    subtitle_data = process_subtitles(subtitle_text, format_type)
                    
                    # 기존 응답에 서브타이틀 데이터 추가
                    result['data']['subtitles'] = subtitle_data['subtitles']
                    
                    # videoInfo 객체가 응답에 포함되어 있지 않은 경우 추가
                    if 'videoInfo' not in result['data'] or not result['data']['videoInfo']:
                        result['data']['videoInfo'] = video_info
                
                return success, result
            else:
                error_msg = result.get("message", "알 수 없는 오류")
                logger.warning(f"방법 '{method_name}' 실패: {error_msg}")
                errors[method_name] = error_msg
                
                # 비디오에 자막이 없는 경우 사용 가능한 언어 목록 반환 (첫 번째 방법 실패 시에만)
                if 'availableLanguages' in result and method_name == "YouTube Transcript API":
                    # 다음 방법이 있으면 계속 진행
                    if not response_sent and len(extraction_methods) > 1:
                        continue
                    
                    response_sent = True
                    return False, {
                        "success": False,
                        "message": f"요청한 언어({language})의 자막을 찾을 수 없습니다.",
                        "availableLanguages": result.get('availableLanguages', [])
                    }
                    
        except Exception as e:
            logger.error(f"방법 '{method_name}' 예외 발생: {str(e)}")
            errors[method_name] = str(e)
            traceback.print_exc()
    
    # 모든 방법 실패
    if not response_sent:
        logger.error("자막 추출 실패")
        return False, {
            "success": False,
            "message": f"비디오 {video_id}의 자막을 찾을 수 없습니다.",
            "errors": errors
        }
    
    # 이미 응답이 전송된 경우 (이 코드에 도달하지 않아야 함)
    return False, {"success": False, "message": "알 수 없는 오류가 발생했습니다."}

async def _run_ytdlp_async(video_id: str, language: str, video_info: Dict[str, Any], max_retries: int = 3) -> Tuple[bool, Dict[str, Any]]:
    """
    yt-dlp를 비동기로 실행하는 래퍼 함수
    """
    for attempt in range(max_retries):
        try:
            # Tor 사용 시 ID 변경 시도 (매 시도마다)
            if USE_TOR_NETWORK and attempt > 0:
                try:
                    logger.info("Tor 네트워크 ID 변경 시도...")
                    rotate_tor_identity()
                    await asyncio.sleep(2)  # ID 변경 후 잠시 대기
                except Exception as e:
                    logger.warning(f"Tor ID 변경 실패 (무시): {str(e)}")
            
            # 요청마다 다른 브라우저 지문 사용
            user_agent = get_random_browser_fingerprint()
            
            # 헤더 랜덤화
            http_headers = get_random_headers()
            
            # 쿠키 설정 (쿠키 오류가 많아 사용 빈도 낮춤)
            cookie_file = None
            if random.random() > 0.7 and USE_YTDLP_COOKIES:  # 30% 확률로만 쿠키 사용
                try:
                    cookie_file = f"yt_cookies_{random.randint(1, 5)}.txt"
                    with open(cookie_file, 'w') as f:
                        f.write(create_youtube_cookies())
                except Exception as e:
                    logger.warning(f"쿠키 파일 생성 실패 (무시): {str(e)}")
                    cookie_file = None
            
            # 인증 설정 추가
            auth_opts = setup_yt_auth(False)
            
            # 다운로드 옵션 설정 (자막 중심)
            ydl_opts = get_ytdlp_base_options(video_id, language, user_agent, http_headers, cookie_file)
            
            # 인증 설정 병합
            ydl_opts.update(auth_opts)
            
            # 첫 번째 시도에서만 자동 업데이트 시도 (모든 요청마다 하는 건 비효율적)
            if attempt == 0 and random.random() > 0.9:  # 10% 확률로 업데이트 시도
                try:
                    update_ytdlp()
                except:
                    pass
            
            # 로그 수준 조정 (yt-dlp 자체 메시지 출력 제한)
            if attempt > 0:
                ydl_opts['quiet'] = True
                ydl_opts['verbose'] = False
            
            # 실행 모드 로그
            if USE_TOR_NETWORK:
                logger.info(f"yt-dlp + Tor 시도 {attempt+1}/{max_retries}: {video_id}")
            else:
                logger.info(f"yt-dlp 시도 {attempt+1}/{max_retries}: {video_id}")
            
            # yt-dlp는 비동기가 아니므로 run_in_executor를 사용하여 별도 스레드에서 실행
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: _run_ytdlp(video_id, ydl_opts, language, video_info))
            
            if result[0]:  # 성공
                return result
            
            # 실패했지만 마지막 시도가 아닌 경우
            if result[1].get('message', '').startswith('Could not find captions'):
                if attempt < max_retries - 1:
                    logger.warning(f"자막을 찾을 수 없음. 다른 방법으로 재시도 ({attempt+1}/{max_retries})...")
                    await asyncio.sleep(random.uniform(2, 5))
                    continue
            
            # 쿠키 관련 오류는 쿠키 없이 재시도
            if "invalid Netscape format cookies file" in result[1].get('message', '') and cookie_file:
                logger.warning("쿠키 파일 오류. 쿠키 없이 재시도...")
                
                # 쿠키 파일 삭제
                try:
                    if os.path.exists(cookie_file):
                        os.remove(cookie_file)
                except:
                    pass
                
                # 쿠키 없이 옵션 재설정
                ydl_opts = get_ytdlp_base_options(video_id, language, user_agent, http_headers, None)
                ydl_opts.update(auth_opts)
                
                # 재실행
                result = await loop.run_in_executor(None, lambda: _run_ytdlp(video_id, ydl_opts, language, video_info))
                if result[0]:  # 성공
                    return result
            
            # 기타 오류는 바로 반환
            return result
        
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"yt-dlp 시도 {attempt+1}/{max_retries} 실패: {error_msg}")
            
            if "HTTP Error 429" in error_msg or "Precondition check failed" in error_msg or "Sign in to confirm you're not a bot" in error_msg:  # 너무 많은 요청 또는 봇 감지
                wait_time = (2 ** attempt) * 10  # 지수 백오프
                logger.info(f"봇 감지됨. {wait_time}초 대기 후 재시도합니다...")
                
                # Tor 사용 시 ID 변경 시도
                if USE_TOR_NETWORK:
                    try:
                        rotate_tor_identity()
                        logger.info("Tor ID 변경됨. 새 IP로 재시도합니다.")
                    except:
                        pass
                
                await asyncio.sleep(wait_time)
            elif "This video is unavailable" in error_msg:
                # 비디오 자체가 사용 불가능한 경우 더 이상 시도하지 않음
                return False, {
                    'success': False,
                    'message': "Video is unavailable or private"
                }
            elif "invalid Netscape format cookies file" in error_msg:
                # 쿠키 파일 오류는 무시하고 재시도
                logger.warning("쿠키 파일 오류. 쿠키 없이 재시도합니다.")
                continue
            elif attempt < max_retries - 1:
                await asyncio.sleep(random.uniform(2, 5))  # 일반 오류 시 짧은 대기
            else:
                # 모든 방법 실패, 마지막 오류 메시지 반환
                return False, {
                    'success': False,
                    'message': error_msg
                }
    
    return False, {
        'success': False,
        'message': "Maximum retries exceeded"
    }

def _run_ytdlp(video_id: str, ydl_opts: Dict[str, Any], language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    yt-dlp를 실행하여 자막을 추출하는 내부 함수입니다.
    비동기 환경에서 run_in_executor로 호출됩니다.
    """
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # 정보 추출 (자막 포함)
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            
            # 더 자세한 비디오 정보 가져오기
            video_info = {
                'title': info.get('title', f"Video {video_id}"),
                'channelName': info.get('uploader', "Unknown"),
                'thumbnailUrl': info.get('thumbnail', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                'videoId': video_id
            }
            
            # 자막 추출 시도
            subtitle_text = extract_subtitle_text(info, language)
            
            # 임시 쿠키 파일 삭제
            cookie_file = ydl_opts.get('cookiefile')
            if cookie_file and os.path.exists(cookie_file) and random.random() > 0.5:
                try:
                    os.remove(cookie_file)
                except:
                    pass
            
            if subtitle_text:
                logger.info(f"yt-dlp 방식으로 자막 추출 성공: {len(subtitle_text)} 자")
                return True, {
                    'success': True,
                    'data': {
                        'text': subtitle_text,
                        'subtitles': [],  # Node.js 백엔드와 호환성 위해 빈 배열 추가
                        'videoInfo': video_info
                    }
                }
            else:
                logger.error(f"자막을 찾을 수 없음: {video_id}")
                return False, {
                    'success': False,
                    'message': f"Could not find captions for video: {video_id}" 
                }
                
    except Exception as e:
        logger.error(f"yt-dlp 자막 추출 중 오류: {str(e)}")
        return False, {
            'success': False,
            'message': str(e)
        }

async def extract_subtitles_with_browser(video_id: str, language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    브라우저를 사용해 YouTube 자막을 추출합니다.
    """
    logger.info(f"브라우저 방식으로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        async with async_playwright() as p:
            # 프록시 설정 (선택적)
            proxy_info = None
            if USE_PROXIES:
                proxy_dict = proxy_manager.get_proxy()
                if proxy_dict and 'http' in proxy_dict:
                    proxy_server = proxy_dict['http'].replace('http://', '')
                    logger.info(f"Playwright에 프록시 적용: {proxy_server}")
                    proxy_info = {
                        "server": proxy_server
                    }
            
            # 브라우저 시작 (특정 환경에서는 headless=False 사용)
            # 클라우드 환경에서는 headless=True만 지원할 수 있으므로 조건부로 설정
            use_headless = True  # 서버 환경 기본값
            
            # 더 자연스러운 브라우저 설정
            browser_args = [
                '--disable-blink-features=AutomationControlled',  # 자동화 감지 비활성화
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--no-sandbox',
                '--disable-translate',
                '--disable-notifications',
                '--window-size=1920,1080',  # 일반적인 화면 크기
                f'--user-agent={get_random_browser_fingerprint()}'  # 랜덤 UA 설정
            ]
            
            browser = await p.chromium.launch(
                headless=use_headless, 
                args=browser_args, 
                slow_mo=random.randint(50, 150),  # 브라우저 작업 속도 무작위화
                downloads_path="/tmp/playwright_downloads",
                proxy=proxy_info
            )
            
            # 브라우저 컨텍스트 생성 (고급 설정)
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                locale='ko-KR',  # 한국어 설정
                timezone_id='Asia/Seoul',  # 서울 시간대
                geolocation={'latitude': 37.5665, 'longitude': 126.9780},  # 서울 위치
                permissions=['geolocation'],
                java_script_enabled=True,
                user_agent=get_random_browser_fingerprint(),
                http_credentials={'username': 'user', 'password': 'pass'} if random.random() < 0.3 else None,  # 가끔 인증 정보 사용
                accept_downloads=True
            )
            
            # YouTube 쿠키 로드
            await load_youtube_cookies(context)
            
            # 새 페이지 생성
            page = await context.new_page()
            
            # 인간 행동 시뮬레이션
            await set_human_behavior(page)
            
            # 비디오 페이지 접속
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            logger.info(f"브라우저로 페이지 접속: {video_url}")
            
            # 페이지 로딩
            await page.goto(video_url, wait_until="networkidle", timeout=30000)
            
            # 랜덤 시간 대기 (인간처럼 행동)
            await asyncio.sleep(random.uniform(2, 5))
            
            # 자막 버튼 클릭 시도
            try:
                caption_button = page.locator(".ytp-subtitles-button")
                if await caption_button.is_visible():
                    await caption_button.click()
                    await asyncio.sleep(1)
                    
                    # 자막 설정 버튼
                    settings_button = page.locator(".ytp-settings-button")
                    if await settings_button.is_visible():
                        await settings_button.click()
                        await asyncio.sleep(0.5)
                        
                        # 자막 메뉴 찾기
                        subtitles_menu = page.locator("div.ytp-panel-menu [role='menuitem']").nth(1)
                        if await subtitles_menu.is_visible():
                            await subtitles_menu.click()
                            await asyncio.sleep(0.5)
                            
                            # 언어 선택 시도
                            lang_menu_items = page.locator("div.ytp-panel-menu [role='menuitem']")
                            
                            # 언어 메뉴 항목 수 확인
                            count = await lang_menu_items.count()
                            for i in range(count):
                                item = lang_menu_items.nth(i)
                                item_text = await item.text_content()
                                if language in item_text.lower() or "korean" in item_text.lower():
                                    await item.click()
                                    break
            except Exception as e:
                logger.warning(f"자막 버튼 클릭 실패: {str(e)}")
            
            # 일부 스크롤
            await page.mouse.wheel(0, random.randint(300, 700))
            await asyncio.sleep(random.uniform(0.5, 1.5))
            
            # 동영상 재생 시작
            try:
                play_button = page.locator(".ytp-play-button")
                if await play_button.is_visible():
                    await play_button.click()
                    await asyncio.sleep(3)  # 비디오 시작 대기
            except Exception as e:
                logger.warning(f"재생 버튼 클릭 실패: {str(e)}")
            
            # 페이지에서 자막 추출 시도
            subtitle_script = """
            () => {
                try {
                    // 자막 컨테이너 찾기
                    const captionWindow = document.querySelector('.ytp-caption-window-container');
                    if (captionWindow) {
                        return Array.from(captionWindow.querySelectorAll('.captions-text')).map(el => el.textContent).join('\\n');
                    }
                    
                    // ytInitialPlayerResponse에서 자막 데이터 찾기
                    let ytInitialData = null;
                    for (const script of document.querySelectorAll('script')) {
                        if (script.textContent.includes('ytInitialPlayerResponse')) {
                            const match = script.textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                            if (match) {
                                ytInitialData = JSON.parse(match[1]);
                                break;
                            }
                        }
                    }
                    
                    if (ytInitialData && ytInitialData.captions) {
                        return JSON.stringify(ytInitialData.captions);
                    }
                    
                    return "자막 데이터를 찾을 수 없습니다.";
                } catch (e) {
                    return "자막 추출 중 오류: " + e.toString();
                }
            }
            """
            
            # 스크립트 실행하여 자막 추출
            subtitle_data = await page.evaluate(subtitle_script)
            
            # 제목과 채널 이름 추출
            title = await page.title()
            channel_name = "Unknown"
            try:
                channel_elem = page.locator('#owner #channel-name a')
                if await channel_elem.is_visible():
                    channel_name = await channel_elem.text_content()
            except:
                pass
                
            # 추출된 데이터 확인
            if subtitle_data and subtitle_data != "자막 데이터를 찾을 수 없습니다." and subtitle_data != "자막 추출 중 오류":
                # 쿠키 저장
                await save_youtube_cookies(context)
                
                # 브라우저 닫기
                await browser.close()
                
                # 비디오 정보 업데이트
                if title:
                    video_info["title"] = title.replace(" - YouTube", "")
                if channel_name:
                    video_info["channelName"] = channel_name.strip()
                
                logger.info(f"브라우저 방식으로 자막 추출 성공: {video_id}")
                return True, {
                    'success': True,
                    'data': {
                        'text': subtitle_data,
                        'subtitles': [],
                        'videoInfo': video_info
                    }
                }
            
            # YouTube에서 ytInitialPlayerResponse 추출
            player_script = """
            () => {
                try {
                    let result = { found: false, data: null };
                    
                    // ytInitialPlayerResponse 탐색
                    for (const script of document.querySelectorAll('script')) {
                        if (script.textContent.includes('ytInitialPlayerResponse')) {
                            const match = script.textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                            if (match) {
                                result.found = true;
                                result.data = JSON.parse(match[1]);
                                break;
                            }
                        }
                    }
                    
                    if (!result.found) {
                        // 다른 방법으로 시도
                        if (window.ytInitialPlayerResponse) {
                            result.found = true;
                            result.data = window.ytInitialPlayerResponse;
                        }
                    }
                    
                    return result;
                } catch (e) {
                    return { found: false, error: e.toString() };
                }
            }
            """
            
            player_data = await page.evaluate(player_script)
            
            # 쿠키 저장
            await save_youtube_cookies(context)
            
            # 브라우저 닫기
            await browser.close()
            
            if player_data.get('found') and player_data.get('data'):
                player_json = player_data.get('data')
                
                # 비디오 정보 업데이트
                if 'videoDetails' in player_json:
                    video_details = player_json['videoDetails']
                    if 'title' in video_details:
                        video_info['title'] = video_details['title']
                    if 'author' in video_details:
                        video_info['channelName'] = video_details['author']
                    if 'thumbnail' in video_details and 'thumbnails' in video_details['thumbnail']:
                        thumbnails = video_details['thumbnail']['thumbnails']
                        if thumbnails and len(thumbnails) > 0:
                            video_info['thumbnailUrl'] = thumbnails[-1]['url']
                
                # 자막 데이터 탐색
                if 'captions' in player_json and 'playerCaptionsTracklistRenderer' in player_json['captions']:
                    captions_renderer = player_json['captions']['playerCaptionsTracklistRenderer']
                    if 'captionTracks' in captions_renderer:
                        caption_tracks = captions_renderer['captionTracks']
                        
                        selected_track = None
                        # 원하는 언어의 자막 트랙 찾기
                        for track in caption_tracks:
                            track_lang = track.get('languageCode', '')
                            if language.lower() in track_lang.lower():
                                selected_track = track
                                break
                        
                        # 영어 자막을 대안으로 사용
                        if not selected_track:
                            for track in caption_tracks:
                                track_lang = track.get('languageCode', '')
                                if 'en' in track_lang.lower():
                                    selected_track = track
                                    break
                        
                        # 첫 번째 트랙을 최후의 방법으로 사용
                        if not selected_track and caption_tracks:
                            selected_track = caption_tracks[0]
                        
                        if selected_track and 'baseUrl' in selected_track:
                            base_url = selected_track['baseUrl']
                            logger.info(f"자막 URL 발견: {base_url}")
                            
                            # 비동기 HTTP 요청으로 자막 데이터 가져오기
                            async with aiohttp.ClientSession() as session:
                                try:
                                    # URL에 format=json3 추가
                                    caption_url = f"{base_url}&fmt=json3"
                                    
                                    # 프록시 설정 (선택적)
                                    proxy_for_request = None
                                    if USE_PROXIES and random.random() > 0.5:  # 50% 확률로 프록시 사용
                                        proxy_dict = proxy_manager.get_proxy()
                                        if proxy_dict and 'http' in proxy_dict:
                                            proxy_for_request = proxy_dict['http']
                                            logger.info(f"자막 데이터 요청에 프록시 사용: {proxy_for_request}")
                                    
                                    async with session.get(
                                        caption_url, 
                                        timeout=10, 
                                        proxy=proxy_for_request,
                                        ssl=False,
                                        headers={
                                            'User-Agent': get_random_browser_fingerprint(),
                                            'Referer': f"https://www.youtube.com/watch?v={video_id}",
                                            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                                        }
                                    ) as response:
                                        if response.status == 200:
                                            caption_data = await response.json()
                                            
                                            # JSON 형식 자막 처리
                                            if 'events' in caption_data:
                                                subtitle_lines = []
                                                for event in caption_data['events']:
                                                    if 'segs' in event:
                                                        line = ""
                                                        for seg in event['segs']:
                                                            if 'utf8' in seg:
                                                                line += seg['utf8']
                                                        if line.strip():
                                                            subtitle_lines.append(line.strip())
                                            
                                            subtitle_text = '\n'.join(subtitle_lines)
                                            logger.info(f"JSON 형식 자막 추출 성공: {len(subtitle_text)} 자")
                                except Exception as e:
                                    logger.error(f"자막 데이터 요청 중 오류: {str(e)}")
            
            logger.warning(f"브라우저 방식으로 자막을 찾을 수 없음: {video_id}")
            return False, {
                'success': False,
                'message': f"Could not find captions for video: {video_id} (browser method)"
            }
    except Exception as e:
        logger.error(f"브라우저 자막 추출 과정에서 오류 발생: {str(e)}")
        return False, {
            'success': False,
            'message': f"Error in browser caption extraction: {str(e)}"
        }

async def set_human_behavior(page):
    """
    페이지에서 인간같은 행동을 시뮬레이션합니다.
    """
    # 랜덤 마우스 움직임
    for _ in range(random.randint(2, 5)):
        x = random.randint(100, 800)
        y = random.randint(100, 600)
        await page.mouse.move(x, y)
        await asyncio.sleep(random.uniform(0.1, 0.3))
    
    # 가끔 키보드 입력
    if random.random() < 0.3:
        await page.keyboard.press("Escape")
        await asyncio.sleep(random.uniform(0.2, 0.5))
    
    # 가끔 브라우저 창 크기 변경
    if random.random() < 0.2:
        width = random.randint(1024, 1920)
        height = random.randint(768, 1080)
        await page.set_viewport_size({"width": width, "height": height})
        await asyncio.sleep(random.uniform(0.3, 0.7))

async def load_youtube_cookies(context):
    """
    저장된 YouTube 쿠키를 로드합니다.
    """
    try:
        # 쿠키 파일 존재 여부 확인
        cookie_file = "youtube_cookies.json"
        if os.path.exists(cookie_file):
            with open(cookie_file, "r") as f:
                cookies = json.load(f)
                await context.add_cookies(cookies)
                logger.info("YouTube 쿠키 로드 성공")
    except Exception as e:
        logger.warning(f"YouTube 쿠키 로드 실패: {str(e)}")

async def save_youtube_cookies(context):
    """
    현재 YouTube 쿠키를 저장합니다.
    """
    try:
        cookies = await context.cookies("https://www.youtube.com")
        with open("youtube_cookies.json", "w") as f:
            json.dump(cookies, f)
            logger.info("YouTube 쿠키 저장 성공")
    except Exception as e:
        logger.warning(f"YouTube 쿠키 저장 실패: {str(e)}")

def extract_subtitle_text(info: Dict[str, Any], language: str) -> str:
    """
    비디오 정보에서 자막 텍스트를 추출합니다.
    """
    subtitle_text = ""
    video_id = info.get('id', '')
    
    # 언어 코드 처리 (일부 자막은 'en-US'와 같은 형식일 수 있음)
    language_base = language.split('-')[0]
    possible_language_codes = [
        language,
        language_base,
        f"{language_base}-{language_base.upper()}",  # ko-KO
        f"{language_base}-{language_base.capitalize()}"  # ko-Ko
    ]
    
    # 일반 자막 확인 (여러 가능한 언어 코드로 시도)
    if 'subtitles' in info and info['subtitles']:
        logger.info(f"사용 가능한 일반 자막: {list(info['subtitles'].keys())}")
        
        # 요청한 언어 또는 유사 코드로 시도
        for lang_code in possible_language_codes:
            if lang_code in info['subtitles']:
                logger.info(f"일반 자막 발견 (언어: {lang_code})")
                subtitle_text = process_subtitle_entries(info['subtitles'][lang_code])
                if subtitle_text:
                    return subtitle_text
    
    # 자막이 없으면 자동 생성 자막 확인 (여러 가능한 언어 코드로 시도)
    if not subtitle_text and 'automatic_captions' in info and info['automatic_captions']:
        logger.info(f"사용 가능한 자동 생성 자막: {list(info['automatic_captions'].keys())}")
        
        for lang_code in possible_language_codes:
            if lang_code in info['automatic_captions']:
                logger.info(f"자동 생성 자막 발견 (언어: {lang_code})")
                subtitle_text = process_subtitle_entries(info['automatic_captions'][lang_code])
                if subtitle_text:
                    return subtitle_text
    
    # 한국어가 아닌 경우, 영어 자막으로 대체 시도
    if not subtitle_text and language != 'en' and language_base != 'en':
        logger.info(f"{language} 자막 없음, 영어 자막 시도")
        
        # 영어 일반 자막 시도
        if 'subtitles' in info and info['subtitles']:
            for eng_code in ['en', 'en-US', 'en-GB']:
                if eng_code in info['subtitles']:
                    logger.info(f"영어 일반 자막 발견 (코드: {eng_code})")
                    subtitle_text = process_subtitle_entries(info['subtitles'][eng_code])
                    if subtitle_text:
                        return subtitle_text
        
        # 영어 자동 생성 자막 시도
        if not subtitle_text and 'automatic_captions' in info and info['automatic_captions']:
            for eng_code in ['en', 'en-US', 'en-GB']:
                if eng_code in info['automatic_captions']:
                    logger.info(f"영어 자동 생성 자막 발견 (코드: {eng_code})")
                    subtitle_text = process_subtitle_entries(info['automatic_captions'][eng_code])
                    if subtitle_text:
                        return subtitle_text
    
    # 마지막 시도: 어떤 언어든 찾을 수 있는 자막 사용
    if not subtitle_text:
        logger.info("어떤 언어든 자막 찾기 시도")
        
        # 일반 자막 중 첫 번째 사용 가능한 것
        if 'subtitles' in info and info['subtitles']:
            for lang_code, subtitles in info['subtitles'].items():
                if subtitles:
                    logger.info(f"대체 자막 발견 (언어: {lang_code})")
                    subtitle_text = process_subtitle_entries(subtitles)
                    if subtitle_text:
                        return subtitle_text
        
        # 자동 생성 자막 중 첫 번째 사용 가능한 것
        if not subtitle_text and 'automatic_captions' in info and info['automatic_captions']:
            for lang_code, subtitles in info['automatic_captions'].items():
                if subtitles:
                    logger.info(f"대체 자동 생성 자막 발견 (언어: {lang_code})")
                    subtitle_text = process_subtitle_entries(subtitles)
                    if subtitle_text:
                        return subtitle_text
    
    if not subtitle_text:
        logger.warning(f"자막을 찾을 수 없음 (비디오 ID: {video_id}, 요청 언어: {language})")
    
    return subtitle_text

def process_subtitle_entries(subtitle_entries: List[Dict[str, Any]]) -> str:
    """
    자막 항목에서 텍스트를 추출하고 처리합니다.
    """
    text_parts = []
    
    try:
        for entry in subtitle_entries:
            # 자막 URL이 있는 경우
            if 'url' in entry:
                logger.info(f"자막 URL 발견: {entry.get('ext', 'unknown')} 형식")
                # yt-dlp는 이미 내부적으로 이 URL에서 자막을 가져옴
            
            # 자막 데이터가 직접 있는 경우
            elif 'data' in entry:
                logger.info("자막 데이터 직접 발견")
                # 데이터가 있지만 처리 방법은 형식에 따라 다름
            
            # 자막 텍스트가 직접 있는 경우 (일부 yt-dlp 버전)
            elif 'text' in entry:
                text_parts.append(entry['text'])
    
        # yt-dlp로 가져온 자막이 있는 경우 반환
        if text_parts:
            return '\n'.join(text_parts)
            
        # yt-dlp의 내부 속성에서 자막 찾기 (yt-dlp 버전에 따라 다름)
        elif '_subtitles' in subtitle_entries:
            subtitles = subtitle_entries['_subtitles']
            if isinstance(subtitles, str):
                return subtitles
            elif isinstance(subtitles, list):
                return '\n'.join([item.get('text', '') for item in subtitles if 'text' in item])
    except Exception as e:
        logger.error(f"자막 항목 처리 중 오류: {str(e)}")
    
    # 자막을 직접 찾을 수 없는 경우, yt-dlp가 추출한 파일에서 찾기 시도
    # (yt-dlp의 downloadFile 옵션을 사용하는 경우)
    try:
        # yt-dlp 임시 파일 패턴 확인
        import glob
        subtitle_files = glob.glob(f"*.{video_id}.*")
        if subtitle_files:
            for file in subtitle_files:
                if file.endswith('.vtt') or file.endswith('.srt'):
                    with open(file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    os.remove(file)  # 임시 파일 삭제
                    return process_subtitle_file_content(content)
    except Exception as e:
        logger.error(f"자막 파일 처리 중 오류: {str(e)}")
    
    # 자막을 찾을 수 없지만 더미 데이터가 필요할 경우
    if not text_parts and subtitle_entries:
        logger.warning("자막 형식을 인식할 수 없어 더미 데이터 반환")
        return "자막을 추출할 수 없습니다. 다른 언어로 시도해보세요."
    
    return ''.join(text_parts)

def process_subtitle_file_content(content: str) -> str:
    """
    VTT 또는 SRT 형식의 자막 파일 내용을 처리합니다.
    """
    lines = content.split('\n')
    text_parts = []
    
    # 간단한 VTT/SRT 파싱 (더 정교한 파서 필요할 수 있음)
    for i, line in enumerate(lines):
        line = line.strip()
        # 시간 코드 또는 번호 행이 아닌 경우만 추가
        if line and not line.startswith('WEBVTT') and not '-->' in line and not line.isdigit():
            # 스타일 태그 제거
            line = re.sub(r'<[^>]+>', '', line)
            if line:
                text_parts.append(line)
    
    return '\n'.join(text_parts)

def get_random_headers():
    languages = ['ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'en-US,en;q=0.9,ko;q=0.8',
                'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
                'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7']
    
    referers = [
        'https://www.youtube.com/results?search_query=python+tutorial',
        'https://www.youtube.com/',
        'https://www.google.com/search?q=youtube+videos',
        'https://www.google.com/',
        None  # 일부는 referer 없이
    ]
    
    headers = {
        'Accept-Language': random.choice(languages),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'DNT': '1' if random.random() > 0.3 else None,  # 70% 확률로 DNT 설정
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'TE': 'trailers' if random.random() > 0.7 else None,
    }
    
    # Referer 랜덤 추가
    referer = random.choice(referers)
    if referer:
        headers['Referer'] = referer
    
    # 일부 불필요한 헤더 무작위 제거
    for key in list(headers.keys()):
        if random.random() < 0.2 and key not in ['Accept', 'Accept-Language']:  # 20% 확률로 핵심 아닌 헤더 제거
            headers.pop(key)
            
    return {k: v for k, v in headers.items() if v is not None}

def create_youtube_cookies():
    """
    YouTube 쿠키 문자열을 생성합니다.
    """
    try:
        # 유효한 Netscape 형식의 쿠키 파일 생성
        cookie_content = """# Netscape HTTP Cookie File
# This file was generated by libcurl! Edit at your own risk.
.youtube.com	TRUE	/	FALSE	2147483647	CONSENT	YES+cb.20210328-17-p0.en+FX+299
.youtube.com	TRUE	/	FALSE	2147483647	VISITOR_INFO1_LIVE	{}
.youtube.com	TRUE	/	FALSE	2147483647	YSC	{}
.youtube.com	TRUE	/	FALSE	2147483647	GPS	1
""".format(
            ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=27)),
            ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_', k=11))
        )
        
        # 쿠키 파일이 실제로 필요한 경우, 여기에서 파일로 작성
        with open(cookies_file, 'w') as f:
            f.write(cookie_content)
            
        return cookie_content
    except Exception as e:
        logger.error(f"쿠키 생성 오류: {str(e)}")
        # 오류 발생 시에도 기본 쿠키 문자열 반환
        return """# Netscape HTTP Cookie File
# This file was generated by libcurl! Edit at your own risk.
.youtube.com	TRUE	/	FALSE	2147483647	CONSENT	YES+cb.20210328-17-p0.en+FX+299
"""

def get_random_browser_fingerprint():
    # 다양한 브라우저 버전
    chrome_versions = ['91.0.4472.124', '92.0.4515.107', '93.0.4577.63', '94.0.4606.81']
    firefox_versions = ['90.0', '91.0', '92.0', '93.0']
    safari_versions = ['14.1.2', '15.0', '15.1', '15.2']
    
    # 다양한 OS 버전
    windows_versions = ['Windows NT 10.0', 'Windows NT 6.1']
    mac_versions = ['Macintosh; Intel Mac OS X 10_15_7', 'Macintosh; Intel Mac OS X 11_5_2']
    
    # 무작위 플랫폼 선택
    platform = random.choice(['Windows', 'Mac', 'Linux', 'iPhone'])
    
    if platform == 'Windows':
        os_version = random.choice(windows_versions)
        browser = random.choice(['Chrome', 'Firefox', 'Edge'])
        if browser == 'Chrome':
            version = random.choice(chrome_versions)
            return f'Mozilla/5.0 ({os_version}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Safari/537.36'
        elif browser == 'Firefox':
            version = random.choice(firefox_versions)
            return f'Mozilla/5.0 ({os_version}; Win64; x64; rv:{version}) Gecko/20100101 Firefox/{version}'
        else:  # Edge
            edge_version = random.randint(90, 99)
            return f'Mozilla/5.0 ({os_version}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.choice(chrome_versions)} Safari/537.36 Edg/{edge_version}.0.864.59'
    
    # 나머지 플랫폼에 대한 설정 유사하게 구현...
    
    # 기본값
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

def extract_subtitles_with_transcript_api(video_id: str, language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    YouTube Transcript API를 사용하여 자막을 추출합니다.
    성능 최적화를 위해 불필요한 작업을 줄이고 빠르게 자막을 추출합니다.
    실제 비디오 정보를 반환 결과에 명시적으로 포함합니다.
    프론트엔드 형식에 맞게 응답을 구성합니다.
    """
    logger.info(f"YouTube Transcript API로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        # 자막 언어 코드 매핑 (요청된 언어에 대한 여러 형식 시도)
        lang_code_map = {
            'ko': ['ko', 'ko-KR'],
            'en': ['en', 'en-US'],
            'ja': ['ja', 'ja-JP'],
            'zh': ['zh', 'zh-CN', 'zh-TW'],
            'fr': ['fr', 'fr-FR'],
            'de': ['de', 'de-DE'],
        }
        
        # 요청 언어에 대한 다양한 코드 시도 (최대 2개까지만)
        target_langs = lang_code_map.get(language, [language])
        if len(target_langs) > 2:
            target_langs = target_langs[:2]  # 최대 2개 언어 코드만 시도 (시간 단축)
            
        # 사용 가능한 자막 목록 가져오기
        available_langs = []
        transcript = None
        
        try:
            # 단일 요청으로 처리
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # 자막 정보를 모두 가져와서 처리
            for transcript_item in transcript_list:
                available_langs.append(transcript_item.language_code)
                
                # 원하는 언어와 일치하는지 확인 (첫 번째 일치하는 것 사용)
                if transcript_item.language_code in target_langs:
                    transcript = transcript_item
                    logger.info(f"자막 발견: {transcript_item.language_code}")
                    break
            
            if available_langs:
                logger.info(f"사용 가능한 자막: {available_langs}")
        except Exception as e:
            logger.warning(f"트랜스크립트 목록 가져오기 실패: {str(e)}")
        
        # 자막 발견된 경우 처리
        if transcript:
            try:
                # 자막 데이터 가져오기
                transcript_data = transcript.fetch()
                
                # 자막 텍스트 및 서브타이틀 항목 생성
                subtitle_lines = []
                for item in transcript_data:
                    text = item.get('text', '').strip()
                    if text:
                        subtitle_lines.append(text)
                
                # 프론트엔드 형식에 맞게 응답 구성
                subtitle_text = '\n'.join(subtitle_lines)
                full_text = ' '.join(subtitle_lines)  # 프론트엔드용 전체 텍스트 (공백으로 연결)
                subtitles = convert_transcript_api_format(transcript_data)
                
                # 자막이 성공적으로 추출된 경우
                if subtitle_text:
                    logger.info(f"자막 추출 성공: {len(subtitle_text)} 자")
                    
                    # 비디오 정보가 기본값인 경우 로그 출력
                    if video_info.get('title') == 'Unknown' or video_info.get('channelName') == 'Unknown':
                        logger.warning(f"비디오 정보가 기본값입니다: {video_info}")
                    
                    # 실제 비디오 정보를 반환 결과에 포함
                    return True, {
                        'success': True,
                        'data': {
                            'text': subtitle_text,
                            'fullText': full_text,  # 프론트엔드용 전체 텍스트 (공백으로 연결)
                            'subtitles': subtitles,
                            'videoInfo': {
                                'title': video_info.get('title', 'Unknown'),
                                'channelName': video_info.get('channelName', 'Unknown'),
                                'thumbnailUrl': video_info.get('thumbnailUrl', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                                'videoId': video_id
                            }
                        }
                    }
            except Exception as e:
                logger.error(f"자막 데이터 처리 중 오류: {str(e)}")
        
        # 직접 특정 언어 요청으로 시도 (최대 효율화를 위해 단 한 번만 시도)
        if not transcript and target_langs:
            try:
                lang_to_try = target_langs[0]  # 첫 번째 언어 코드만 시도
                transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang_to_try])
                
                # 자막 텍스트 및 서브타이틀 항목 생성
                subtitle_lines = []
                for item in transcript_data:
                    text = item.get('text', '').strip()
                    if text:
                        subtitle_lines.append(text)
                
                subtitle_text = '\n'.join(subtitle_lines)
                full_text = ' '.join(subtitle_lines)  # 프론트엔드 요구사항에 맞는 형식
                subtitles = convert_transcript_api_format(transcript_data)
                
                if subtitle_text:
                    logger.info(f"직접 요청으로 자막 추출 성공: {len(subtitle_text)} 자")
                    
                    # 실제 비디오 정보를 반환 결과에 포함
                    return True, {
                        'success': True,
                        'data': {
                            'text': subtitle_text,
                            'fullText': full_text,  # 프론트엔드용 전체 텍스트 (공백으로 연결)
                            'subtitles': subtitles,
                            'videoInfo': {
                                'title': video_info.get('title', 'Unknown'),
                                'channelName': video_info.get('channelName', 'Unknown'),
                                'thumbnailUrl': video_info.get('thumbnailUrl', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                                'videoId': video_id
                            }
                        }
                    }
            except Exception as e:
                logger.warning(f"직접 자막 요청 실패: {str(e)}")
        
        # 요청한 언어의 자막을 찾지 못한 경우
        if available_langs:
            available_str = ", ".join(available_langs)
            return False, {
                'success': False,
                'message': f"요청한 언어({language})의 자막을 찾을 수 없습니다.",
                'availableLanguages': available_langs
            }
        else:
            # 사용 가능한 자막이 없는 경우
            return False, {
                'success': False,
                'message': f"이 비디오에는 자막이 없습니다: {video_id}"
            }
    
    except _errors.TranscriptsDisabled:
        return False, {
            'success': False,
            'message': f"이 비디오의 자막이 비활성화되어 있습니다: {video_id}"
        }
    except _errors.NoTranscriptAvailable:
        return False, {
            'success': False,
            'message': f"이 비디오에는 자막이 없습니다: {video_id}"
        }
    except Exception as e:
        logger.error(f"YouTube Transcript API 사용 중 오류: {str(e)}")
        return False, {
            'success': False,
            'message': f"자막 추출 중 오류 발생: {str(e)}"
        }

def get_video_info_minimal(video_id: str) -> dict:
    """
    가벼운 버전의 비디오 정보 가져오기 함수입니다.
    메타데이터만 가져와서 빠르게 처리합니다.
    """
    logger.info(f"비디오 정보 가져오기 시작: {video_id}")
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    # 쿠키 파일 사용
    try:
        # 기존 쿠키 파일 사용 (없으면 생성)
        cookie_str = create_youtube_cookies()
        with open(cookies_file, 'w') as f:
            f.write(cookie_str)
        logger.info(f"쿠키 파일 준비 완료: {cookies_file}")
    except Exception as e:
        logger.warning(f"쿠키 파일 준비 실패 (무시): {str(e)}")
    
    # yt-dlp 옵션 설정 (간소화)
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'skip_download': True,
        'nocheckcertificate': True,  # SSL 인증서 검증 비활성화
    }
    
    # Tor 네트워크 사용 (설정된 경우)
    if USE_TOR_NETWORK:
        ydl_opts['proxy'] = TOR_PROXY
    
    # 쿠키 파일 설정
    if os.path.exists(cookies_file):
        ydl_opts['cookiefile'] = cookies_file
    
    # 기본 반환값 설정
    result = {
        'title': "Unknown",
        'channelName': "Unknown",
        'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        'videoId': video_id
    }
    
    # 3번 시도
    for attempt in range(3):
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
                if info:
                    # 기본 정보 가져오기
                    result['title'] = info.get('title', "Unknown")
                    result['channelName'] = info.get('uploader', "Unknown")
                    
                    # 썸네일 URL 가져오기
                    if 'thumbnails' in info and info['thumbnails']:
                        # 썸네일 중에서 가장 큰 것 선택
                        thumbnails = sorted(info['thumbnails'], 
                                          key=lambda x: x.get('height', 0) * x.get('width', 0) 
                                          if x.get('height') and x.get('width') else 0, 
                                          reverse=True)
                        if thumbnails:
                            result['thumbnailUrl'] = thumbnails[0].get('url', result['thumbnailUrl'])
                    
                    return result
            
            # 성공적으로 정보를 가져왔으면 루프 종료
            break
            
        except Exception as e:
            logger.warning(f"시도 {attempt+1}/3 실패: {str(e)}")
            # 마지막 시도가 아니면 잠시 대기
            if attempt < 2:
                time.sleep(1)
    
    # 웹 페이지에서 직접 정보 추출 시도 (yt-dlp 실패 시)
    try:
        headers = get_random_headers()
        response = requests.get(video_url, headers=headers, timeout=5, verify=False)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 메타 태그에서 정보 추출
            title_tag = soup.find('meta', property='og:title')
            channel_tag = soup.find('meta', property='og:video:tag')
            thumbnail_tag = soup.find('meta', property='og:image')
            
            if title_tag and title_tag.get('content'):
                result['title'] = title_tag.get('content')
            
            if channel_tag and channel_tag.get('content'):
                result['channelName'] = channel_tag.get('content')
            
            if thumbnail_tag and thumbnail_tag.get('content'):
                result['thumbnailUrl'] = thumbnail_tag.get('content')
            
            return result
    except Exception as e:
        logger.error(f"비디오 정보 가져오기 실패: {str(e)}")
    
    # 실패해도 기본 정보 반환
    return result

# 깃헙에서 최신 yt-dlp 버전 확인 및 업데이트 함수
def update_ytdlp():
    """
    yt-dlp를 최신 버전으로 업데이트합니다.
    """
    try:
        import subprocess
        logger.info("yt-dlp 업데이트 시도...")
        result = subprocess.run(['pip', 'install', '--upgrade', 'yt-dlp'], 
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            logger.info("yt-dlp 업데이트 성공")
        else:
            logger.warning(f"yt-dlp 업데이트 실패: {result.stderr}")
    except Exception as e:
        logger.error(f"yt-dlp 업데이트 중 오류 발생: {str(e)}")

def get_ytdlp_base_options(video_id: str, language: str, user_agent: str = None, http_headers: Dict[str, str] = None, cookie_file: str = None):
    """
    yt-dlp 기본 옵션을 가져옵니다.
    """
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    # 기본 yt-dlp 옵션
    ydl_opts = {
        'format': 'best[height<=480]',  # 저화질로 제한하여 속도 개선
        'subtitleslangs': [language],
        'writesubtitles': True,
        'writeautomaticsub': True,
        'skip_download': True,
        'quiet': False,
        'verbose': True,
        'no_warnings': False,
        'ignoreerrors': True,
        'nocheckcertificate': True,  # SSL 인증서 검증 비활성화 (중요)
        'no_color': True
    }
    
    # 사용자 에이전트 설정
    if user_agent:
        ydl_opts['user_agent'] = user_agent
    
    # HTTP 헤더 설정
    if http_headers:
        ydl_opts['http_headers'] = http_headers
    
    # 쿠키 설정
    if cookie_file and os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
    
    # Tor 프록시 설정
    if USE_TOR_NETWORK:
        logger.info("Tor 프록시 사용")
        ydl_opts['proxy'] = TOR_PROXY
    
    return ydl_opts

# Tor 네트워크 연결 테스트 (사용 가능한지 확인)
def test_tor_connection():
    """
    Tor 네트워크 연결을 테스트합니다.
    성공 시 True를 반환하고, 실패 시 False를 반환합니다.
    """
    try:
        # 짧은 타임아웃으로 Tor 상태 확인 (5초)
        logger.info("Tor 연결 테스트 중: https://check.torproject.org/api/ip")
        
        # 세션 생성 및 프록시 설정
        session = requests.Session()
        session.proxies = {
            'http': TOR_PROXY,
            'https': TOR_PROXY
        }
        
        # 연결 테스트 (SSL 인증서 검증 비활성화)
        response = session.get(
            'https://check.torproject.org/api/ip', 
            timeout=5,
            verify=False  # SSL 인증서 검증 비활성화
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('IsTor', False):
                logger.info(f"Tor 연결 성공! IP: {data.get('IP', '알 수 없음')}")
                return True
            else:
                logger.warning("Tor 연결 실패: Tor 네트워크가 아닙니다.")
                return False
        else:
            logger.warning(f"Tor 연결 실패: 상태 코드 {response.status_code}")
            return False
            
    except Exception as e:
        logger.warning(f"Tor 연결 테스트 실패: {str(e)}")
        # 기본 IP 테스트 사이트로 재시도
        try:
            session = requests.Session()
            session.proxies = {
                'http': TOR_PROXY,
                'https': TOR_PROXY
            }
            response = session.get('http://httpbin.org/ip', timeout=5, verify=False)
            if response.status_code == 200:
                logger.info(f"대체 테스트 성공! IP: {response.json().get('origin', '알 수 없음')}")
                return True
            else:
                return False
        except Exception as e2:
            logger.error(f"대체 Tor 테스트도 실패: {str(e2)}")
            return False

# Tor 네트워크 IP 변경 (새 경로)
def rotate_tor_identity():
    """
    Tor 네트워크의 ID를 변경하여 새 IP를 얻습니다.
    """
    if not USE_TOR_NETWORK:
        return False
    
    try:
        from stem import Signal
        from stem.control import Controller
        
        with Controller.from_port(port=9051) as controller:
            controller.authenticate()  # Tor 컨트롤러 비밀번호 설정 필요할 수 있음
            controller.signal(Signal.NEWNYM)
            logger.info("Tor 네트워크 ID 변경 (새 IP 요청)")
            return True
    except Exception as e:
        logger.error(f"Tor ID 변경 실패: {str(e)}")
        return False 

async def extract_subtitles_with_scraping(video_id: str, language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    Beautiful Soup를 사용하여 웹 스크래핑으로 자막을 추출합니다.
    """
    logger.info(f"웹 스크래핑으로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # 랜덤 사용자 에이전트 선택
        user_agent = get_random_browser_fingerprint()
        headers = {
            'User-Agent': user_agent,
            'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': 'https://www.google.com/search?q=youtube',
            'Origin': 'https://www.google.com',
        }
        
        # 랜덤 대기 시간 추가
        await asyncio.sleep(random.uniform(1, 3))
        
        # 세션을 사용하여 쿠키 관리
        session = requests.Session()
        
        # YouTube 홈페이지 먼저 방문 (실제 사용자처럼)
        home_response = session.get('https://www.youtube.com/', headers=headers, timeout=15)
        
        # 비디오 페이지 방문
        response = session.get(url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            logger.error(f"YouTube 페이지 접근 실패: {response.status_code}")
            return False, {
                'success': False,
                'message': f"Failed to access YouTube page: HTTP {response.status_code}"
            }
        
        # HTML 파싱
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 1. ytInitialPlayerResponse 데이터 추출 시도
        scripts = soup.find_all('script')
        player_response = None
        
        for script in scripts:
            if script.string and 'ytInitialPlayerResponse' in script.string:
                try:
                    # JavaScript 변수 추출
                    start = script.string.find('ytInitialPlayerResponse')
                    start = script.string.find('{', start)
                    end = find_json_end(script.string, start)
                    
                    if start > 0 and end > start:
                        json_data = script.string[start:end+1]
                        player_response = json.loads(json_data)
                        break
                except Exception as e:
                    logger.warning(f"playerResponse 파싱 실패: {str(e)}")
        
        if not player_response:
            logger.error("YouTube 플레이어 응답을 찾을 수 없음")
            return False, {
                'success': False,
                'message': "Failed to extract video data"
            }
        
        # 비디오 정보 업데이트
        try:
            video_details = player_response.get('videoDetails', {})
            video_info.update({
                'title': video_details.get('title', video_info['title']),
                'channelName': video_details.get('author', video_info['channelName']),
                'thumbnailUrl': video_details.get('thumbnail', {}).get('thumbnails', [{}])[-1].get('url', video_info['thumbnailUrl']),
                'videoId': video_id
            })
        except Exception as e:
            logger.warning(f"비디오 정보 업데이트 실패: {str(e)}")
        
        # 캡션 데이터 추출
        captions_data = player_response.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
        
        if not captions_data:
            logger.warning("자막 트랙 정보를 찾을 수 없음")
            return False, {
                'success': False,
                'message': f"No caption tracks found for video: {video_id}"
            }
        
        # 요청한 언어 또는 영어 자막 찾기
        language_codes = {
            'ko': ['ko', 'ko-KR', 'ko-KP'],
            'en': ['en', 'en-US', 'en-GB'],
            'ja': ['ja', 'ja-JP'],
            'zh': ['zh', 'zh-CN', 'zh-TW', 'zh-HK']
        }
        
        target_langs = language_codes.get(language, [language])
        caption_track = None
        
        # 첫 번째: 요청한 언어 찾기
        for lang in target_langs:
            for track in captions_data:
                if track.get('languageCode', '').lower() in [lang.lower(), lang.lower().split('-')[0]]:
                    caption_track = track
                    logger.info(f"요청한 언어({lang}) 자막 트랙 발견")
                    break
            if caption_track:
                break
        
        # 두 번째: 영어 자막 찾기 (대체)
        if not caption_track and language != 'en':
            for track in captions_data:
                if track.get('languageCode', '').lower() in ['en', 'en-us', 'en-gb']:
                    caption_track = track
                    logger.info("영어 자막 트랙 발견 (대체)")
                    break
        
        # 마지막: 아무 자막이나 사용
        if not caption_track and captions_data:
            caption_track = captions_data[0]
            logger.info(f"기본 자막 트랙 사용: {caption_track.get('languageCode')}")
        
        if not caption_track:
            logger.error("사용 가능한 자막 트랙이 없음")
            return False, {
                'success': False,
                'message': f"No suitable caption track found for video: {video_id}"
            }
        
        # 자막 URL에서 자막 데이터 가져오기
        caption_url = caption_track.get('baseUrl', '')
        if not caption_url:
            logger.error("자막 URL을 찾을 수 없음")
            return False, {
                'success': False,
                'message': "Failed to get caption URL"
            }
        
        # 자막 데이터 요청
        try:
            caption_response = session.get(caption_url, headers=headers, timeout=15)
            if caption_response.status_code != 200:
                logger.error(f"자막 데이터 요청 실패: {caption_response.status_code}")
                return False, {
                    'success': False,
                    'message': f"Failed to get caption data: HTTP {caption_response.status_code}"
                }
            
            # XML 파싱
            caption_soup = BeautifulSoup(caption_response.text, 'xml')
            text_elements = caption_soup.find_all('text')
            
            if not text_elements:
                logger.warning("XML에서 자막 텍스트를 찾을 수 없음")
                # 다른 형식으로 다시 시도 (JSON)
                try:
                    caption_data = json.loads(caption_response.text)
                    text_elements = caption_data.get('events', [])
                except:
                    text_elements = []
            
            # 자막 텍스트 추출
            subtitle_lines = []
            
            for element in text_elements:
                if isinstance(element, str):
                    # 문자열 처리 (비정상적인 경우)
                    subtitle_lines.append(element)
                elif hasattr(element, 'text') and element.text:
                    # BeautifulSoup 요소 처리
                    subtitle_lines.append(element.text.strip())
                elif isinstance(element, dict) and 'segs' in element:
                    # JSON 형식 처리
                    for seg in element.get('segs', []):
                        if 'utf8' in seg:
                            subtitle_lines.append(seg['utf8'])
            
            subtitle_text = '\n'.join(subtitle_lines)
            
            if not subtitle_text.strip():
                logger.error("자막 텍스트 추출 실패")
                return False, {
                    'success': False,
                    'message': "Failed to extract caption text"
                }
            
            logger.info(f"웹 스크래핑으로 자막 추출 성공: {len(subtitle_text)} 자")
            return True, {
                'success': True,
                'data': {
                    'text': subtitle_text,
                    'subtitles': [],  # 호환성을 위한 빈 배열
                    'videoInfo': video_info
                }
            }
            
        except Exception as e:
            logger.error(f"자막 데이터 요청/파싱 중 오류: {str(e)}")
            return False, {
                'success': False,
                'message': f"Error getting caption data: {str(e)}"
            }
        
    except Exception as e:
        logger.error(f"웹 스크래핑 과정에서 오류 발생: {str(e)}")
        return False, {
            'success': False,
            'message': f"Error in web scraping caption extraction: {str(e)}"
        }

def find_json_end(text: str, start: int) -> int:
    """
    JSON 문자열의 끝 위치를 찾습니다.
    중첩된 괄호를 처리합니다.
    """
    stack = []
    for i in range(start, len(text)):
        if text[i] == '{':
            stack.append('{')
        elif text[i] == '}':
            if stack and stack[-1] == '{':
                stack.pop()
                if not stack:
                    return i
            else:
                return -1  # 균형이 맞지 않는 괄호
    return -1  # 끝 괄호를 찾지 못함 

async def extract_subtitles_with_external_api(video_id: str, language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    외부 자막 API 서비스를 사용하여 자막을 추출합니다.
    여러 외부 API를 시도하여 자막을 가져옵니다.
    """
    logger.info(f"외부 API로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        # 1. 외부 API 서비스 목록 (여러 서비스를 시도)
        external_apis = [
            {
                "name": "YouTubeTranscriptApi (래퍼)",
                "url": f"https://yt-transcript-api.herokuapp.com/transcript?videoId={video_id}&lang={language}",
                "method": "get",
                "headers": {"User-Agent": get_random_browser_fingerprint()},
                "data": None,
                "handler": lambda resp: resp.get("transcript", "")
            },
            {
                "name": "SaveSubs API",
                "url": "https://savesubs.com/action/get",
                "method": "post",
                "headers": {
                    "User-Agent": get_random_browser_fingerprint(),
                    "Content-Type": "application/json",
                    "Origin": "https://savesubs.com",
                    "Referer": "https://savesubs.com/"
                },
                "data": {"url": f"https://www.youtube.com/watch?v={video_id}", "lang": language},
                "handler": lambda resp: resp.get("text", "")
            },
            {
                "name": "DownSub API",
                "url": "https://downsub.com/api/getSubtitle",
                "method": "post",
                "headers": {
                    "User-Agent": get_random_browser_fingerprint(), 
                    "Content-Type": "application/json",
                    "Origin": "https://downsub.com",
                    "Referer": "https://downsub.com/"
                },
                "data": {"url": f"https://www.youtube.com/watch?v={video_id}", "lang": language},
                "handler": lambda resp: resp.get("subtitles", {}).get("text", "")
            }
        ]
        
        # aiohttp 세션 생성
        async with aiohttp.ClientSession() as session:
            for api in external_apis:
                logger.info(f"{api['name']} 시도 중...")
                
                try:
                    # 프록시 설정
                    proxy = get_random_proxy() if USE_PROXIES else None
                    
                    # API 요청 방식에 따라 호출
                    if api["method"].lower() == "get":
                        async with session.get(
                            api["url"], 
                            headers=api["headers"], 
                            proxy=proxy['http'] if proxy and 'http' in proxy else None, 
                            timeout=30,
                            ssl=False
                        ) as response:
                            if response.status == 200:
                                response_data = await response.json()
                                subtitle_text = api["handler"](response_data)
                                
                                if subtitle_text:
                                    logger.info(f"{api['name']}로 자막 추출 성공")
                                    return True, {
                                        'success': True,
                                        'data': {
                                            'text': subtitle_text,
                                            'subtitles': [],
                                            'videoInfo': video_info
                                        }
                                    }
                            else:
                                logger.warning(f"{api['name']} 실패: 상태 코드 {response.status}")
                    else:  # POST 메서드
                        async with session.post(
                            api["url"], 
                            headers=api["headers"], 
                            json=api["data"],
                            proxy=proxy['http'] if proxy and 'http' in proxy else None, 
                            timeout=30,
                            ssl=False
                        ) as response:
                            if response.status == 200:
                                response_data = await response.json()
                                subtitle_text = api["handler"](response_data)
                                
                                if subtitle_text:
                                    logger.info(f"{api['name']}로 자막 추출 성공")
                                    return True, {
                                        'success': True,
                                        'data': {
                                            'text': subtitle_text,
                                            'subtitles': [],
                                            'videoInfo': video_info
                                        }
                                    }
                            else:
                                logger.warning(f"{api['name']} 실패: 상태 코드 {response.status}")
                except Exception as e:
                    logger.error(f"{api['name']} 호출 중 오류: {str(e)}")
                    continue
        
        logger.warning(f"모든 외부 API에서 자막을 찾을 수 없음: {video_id}")
        return False, {
            'success': False,
            'message': f"Could not find captions from external APIs for video: {video_id}"
        }
    except Exception as e:
        logger.error(f"외부 API 자막 추출 과정에서 오류 발생: {str(e)}")
        return False, {
            'success': False,
            'message': f"Error in external API caption extraction: {str(e)}"
        }

# 파일 끝에 추가
try:
    import undetected_chromedriver as uc
    UNDETECTED_CHROME_AVAILABLE = True
except ImportError:
    UNDETECTED_CHROME_AVAILABLE = False
    logger.warning("undetected_chromedriver가 설치되지 않았습니다. 'pip install undetected-chromedriver'로 설치하면 봇 감지 회피 성능이 향상됩니다.")

async def extract_subtitles_with_undetected_chrome(video_id: str, language: str, video_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    undetected_chromedriver를 사용하여 YouTube의 봇 감지를 우회하고 자막을 추출합니다.
    이 방법은 일반 브라우저 자동화보다 감지 회피에 더 효과적입니다.
    """
    if not UNDETECTED_CHROME_AVAILABLE:
        logger.error("undetected_chromedriver가 설치되지 않아 이 방법을 사용할 수 없습니다.")
        return False, {
            'success': False,
            'message': "undetected_chromedriver is not installed"
        }
    
    logger.info(f"undetected_chromedriver로 자막 추출 시작: {video_id}, 언어: {language}")
    
    # 비동기 실행을 위한 래퍼 함수
    def _extract_with_uc():
        browser = None
        try:
            # 브라우저 옵션 설정
            options = uc.ChromeOptions()
            options.add_argument("--disable-gpu")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--lang=ko-KR")  # 한국어 설정
            
            # 헤드리스 모드 (서버 환경에서 필요)
            is_headless = not "DISPLAY" in os.environ or random.random() < 0.7  # 70% 확률로 헤드리스 모드 사용
            if is_headless:
                options.add_argument("--headless=new")  # 새로운 헤드리스 모드

            # 랜덤 사용자 에이전트
            user_agent = get_random_headers().get("User-Agent")
            options.add_argument(f"--user-agent={user_agent}")
            
            # 추가 위장 옵션
            options.add_argument("--disable-blink-features=AutomationControlled")
            
            # 개발자 도구 브레이크포인트 우회
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)
            
            # 프록시 설정 (기본적으로 비활성화)
            proxy = None
            if USE_PROXIES and random.random() < 0.3:  # 30% 확률로만 프록시 사용
                proxy_dict = get_random_proxy()
                if proxy_dict and 'http' in proxy_dict:
                    proxy = proxy_dict['http'].replace('http://', '')
                    logger.info(f"undetected_chromedriver에 프록시 적용: {proxy}")
                    options.add_argument(f'--proxy-server={proxy}')
            
            # 브라우저 생성 (최대 2회 시도)
            # 브라우저 생성
            browser = uc.Chrome(options=options)
            
            # 인간처럼 창 크기 설정
            browser.set_window_size(random.randint(1050, 1920), random.randint(800, 1080))
            
            # 쿠키 설정 및 페이지 로딩
            try:
                browser.get("https://www.youtube.com")
                time.sleep(random.uniform(2, 4))
                
                # YouTube 동영상 페이지 접속
                video_url = f"https://www.youtube.com/watch?v={video_id}"
                browser.get(video_url)
            except Exception as e:
                logger.warning(f"초기 페이지 접속 실패: {str(e)}")
                
                # 브라우저 닫기
                try: 
                    browser.quit() 
                except: 
                    pass
                
                # 프록시가 원인인 경우 프록시 제거
                if proxy:
                    proxy_manager.remove_and_update_proxy(proxy)
                    logger.info("프록시 문제 감지, 프록시 없이 재시도합니다.")
                    
                    # 프록시 없이 새 옵션 생성
                    options = uc.ChromeOptions()
                    options.add_argument("--disable-gpu")
                    options.add_argument("--no-sandbox")
                    options.add_argument("--disable-dev-shm-usage")
                    options.add_argument("--lang=ko-KR")
                    options.add_argument("--headless=new")
                    options.add_argument(f"--user-agent={random.choice(user_agents)}")
                    options.add_argument("--disable-blink-features=AutomationControlled")
                    options.add_experimental_option("excludeSwitches", ["enable-automation"])
                    options.add_experimental_option("useAutomationExtension", False)
                
                # 다시 시도
                browser = uc.Chrome(options=options)
                browser.set_window_size(random.randint(1050, 1920), random.randint(800, 1080))
                
                # 다시 페이지 접속
                browser.get("https://www.youtube.com")
                time.sleep(random.uniform(2, 4))
                video_url = f"https://www.youtube.com/watch?v={video_id}"
                browser.get(video_url)
            except Exception as e:
                logger.error(f"초기 페이지 접속 실패: {str(e)}")
                if proxy:
                    # 프록시 문제인 경우 해당 프록시 블랙리스트에 추가
                    proxy_manager.remove_and_update_proxy(proxy)
                    logger.info("프록시를 블랙리스트에 추가하고 브라우저를 다시 시작합니다.")
                    browser.quit()
                    # 새로운 프록시로 다시 시도
                    return _extract_with_uc()
                else:
                    # 프록시 없이 다시 시도
                    browser.quit()
                    options.arguments.remove("--proxy-server=" + proxy) if proxy else None
                    browser = uc.Chrome(options=options)
            
            # 페이지 로딩 대기
            time.sleep(random.uniform(3, 5))
            
            # 인간처럼 행동 시뮬레이션
            try:
                # 랜덤한 마우스 움직임
                for _ in range(random.randint(2, 5)):
                    browser.execute_script(f"window.scrollTo(0, {random.randint(100, 500)});")
                    time.sleep(random.uniform(0.3, 1.2))
            except:
                pass
            
            # 비디오 정보 추출
            try:
                title_element = browser.find_element("css selector", "h1.title.style-scope.ytd-video-primary-info-renderer")
                video_info['title'] = title_element.text.strip()
            except:
                logger.warning("비디오 제목을 찾을 수 없습니다.")
            
            try:
                channel_element = browser.find_element("css selector", "#channel-name #text")
                video_info['channelName'] = channel_element.text.strip()
            except:
                logger.warning("채널 이름을 찾을 수 없습니다.")
            
            # 자막 버튼 클릭 시도
            try:
                # 비디오 재생 시작
                video_element = browser.find_element("css selector", "video.html5-main-video")
                browser.execute_script("arguments[0].play()", video_element)
                
                # 자막 버튼 활성화
                caption_button = browser.find_element("css selector", ".ytp-subtitles-button")
                if not "ytp-button-toggled" in caption_button.get_attribute("class"):
                    caption_button.click()
                    time.sleep(1)
                
                # 자막 언어 설정 시도
                settings_button = browser.find_element("css selector", ".ytp-settings-button")
                settings_button.click()
                time.sleep(0.5)
                
                # 자막 메뉴 찾기
                try:
                    # 설정에서 자막 관련 메뉴 찾기
                    subtitles_items = browser.find_elements("css selector", ".ytp-menuitem")
                    for item in subtitles_items:
                        if "자막" in item.text or "Subtitles" in item.text or "Caption" in item.text:
                            item.click()
                            time.sleep(0.5)
                            break
                    
                    # 언어 선택 메뉴 항목 찾기
                    language_items = browser.find_elements("css selector", ".ytp-menuitem")
                    for item in language_items:
                        if language in item.text.lower() or "korean" in item.text.lower() or "한국어" in item.text:
                            item.click()
                            time.sleep(0.5)
                            break
                except:
                    logger.warning("자막 설정 메뉴 조작 실패 (무시)")
            except:
                logger.warning("자막 버튼을 찾을 수 없거나 클릭 실패 (무시)")
            
            # 비디오 스크롤 및 자막 표시 대기
            browser.execute_script("window.scrollBy(0, 300)")
            time.sleep(random.uniform(3, 5))
            
            # ytInitialPlayerResponse에서 자막 정보 추출
            script = """
            return (function() {
                // ytInitialPlayerResponse 찾기
                try {
                    let playerResponse = null;
                    // 방법 1: 윈도우 변수에서 직접 가져오기
                    if (window.ytInitialPlayerResponse) {
                        playerResponse = window.ytInitialPlayerResponse;
                    } 
                    // 방법 2: HTML에서 스크립트 태그 찾기
                    else {
                        const scripts = document.querySelectorAll('script');
                        for (const script of scripts) {
                            if (script.textContent.includes('ytInitialPlayerResponse')) {
                                const match = script.textContent.match(/ytInitialPlayerResponse\\s*=\\s*({.+?});/);
                                if (match) {
                                    playerResponse = JSON.parse(match[1]);
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (playerResponse && playerResponse.captions) {
                        return playerResponse.captions;
                    }
                    
                    return null;
                } catch (e) {
                    return { error: e.toString() };
                }
            })();
            """
            
            # 스크립트 실행으로 자막 정보 추출
            captions_data = browser.execute_script(script)
            
            # 현재 표시된 자막 추출 시도
            visible_captions_script = """
            return (function() {
                try {
                    // 화면에 보이는 자막 추출
                    const captionsContainer = document.querySelector('.ytp-caption-segment');
                    if (captionsContainer) {
                        return Array.from(document.querySelectorAll('.ytp-caption-segment'))
                            .map(el => el.textContent).join('\\n');
                    }
                    return '';
                } catch (e) {
                    return '';
                }
            })();
            """
            
            visible_captions = browser.execute_script(visible_captions_script)
            
            # 자막 URL 추출 및 처리
            subtitle_text = ""
            
            if captions_data and 'playerCaptionsTracklistRenderer' in captions_data:
                caption_tracks = captions_data['playerCaptionsTracklistRenderer'].get('captionTracks', [])
                
                # 요청한 언어 또는 영어 자막 찾기
                selected_track = None
                
                # 1. 요청한 언어 찾기
                for track in caption_tracks:
                    track_lang = track.get('languageCode', '').lower()
                    if language.lower() in track_lang or track_lang in language.lower():
                        selected_track = track
                        logger.info(f"요청한 언어({language}) 자막 찾음")
                        break
                
                # 2. 영어 자막으로 폴백
                if not selected_track and language != 'en':
                    for track in caption_tracks:
                        if 'en' in track.get('languageCode', '').lower():
                            selected_track = track
                            logger.info("영어 자막으로 대체")
                            break
                
                # 3. 첫 번째 자막 트랙 사용
                if not selected_track and caption_tracks:
                    selected_track = caption_tracks[0]
                    logger.info(f"첫 번째 자막 트랙 사용: {selected_track.get('languageCode')}")
                
                if selected_track and 'baseUrl' in selected_track:
                    caption_url = selected_track['baseUrl']
                    
                    # 자막 URL에 파라미터 추가 (일부 제한 우회)
                    if not 'fmt=' in caption_url:
                        caption_url += '&fmt=json3'
                    
                    # 자막 데이터 요청
                    try:
                        import requests
                        headers = {
                            'User-Agent': browser.execute_script('return navigator.userAgent'),
                            'Referer': video_url,
                            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                        }
                        
                        # 프록시 사용 여부 결정
                        use_proxy = False
                        req_proxy = None
                        if USE_PROXIES and random.random() > 0.5:  # 50% 확률로 프록시 사용
                            req_proxy = proxy_manager.get_proxy()
                            if req_proxy:
                                use_proxy = True
                                logger.info(f"자막 데이터 요청에 프록시 사용: {req_proxy}")
                        
                        response = requests.get(
                            caption_url, 
                            headers=headers, 
                            proxies=req_proxy if use_proxy else None,
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            caption_data = response.json()
                            
                            # JSON 형식 자막 처리
                            if 'events' in caption_data:
                                subtitle_lines = []
                                for event in caption_data['events']:
                                    if 'segs' in event:
                                        line = ""
                                        for seg in event['segs']:
                                            if 'utf8' in seg:
                                                line += seg['utf8']
                                        if line.strip():
                                            subtitle_lines.append(line.strip())
                                
                                subtitle_text = '\n'.join(subtitle_lines)
                                logger.info(f"JSON 형식 자막 추출 성공: {len(subtitle_text)} 자")
                        else:
                            logger.warning(f"자막 요청 실패: 상태 코드 {response.status_code}")
                            if use_proxy and req_proxy:
                                # 프록시 문제인 경우 블랙리스트에 추가
                                proxy_manager.remove_and_update_proxy(req_proxy)
                    except Exception as e:
                        logger.error(f"자막 URL 요청 실패: {str(e)}")
            
            # 화면에 표시된 자막이 있는 경우 추가
            if not subtitle_text and visible_captions:
                subtitle_text = visible_captions
                logger.info(f"화면에 표시된 자막 추출 성공: {len(subtitle_text)} 자")
            
            # 최종 정리
            browser.quit()
            
            if subtitle_text:
                return True, {
                    'text': subtitle_text,
                    'videoInfo': video_info
                }
            else:
                return False, {
                    'message': f"Could not extract subtitles using undetected_chromedriver for video: {video_id}"
                }
                
        except Exception as e:
            logger.error(f"undetected_chromedriver 자막 추출 오류: {str(e)}")
            try:
                browser.quit()
            except:
                pass
            return False, {
                'message': f"Error extracting subtitles with undetected_chromedriver: {str(e)}"
            }
    
    # 비동기 스레드 풀에서 동기 함수 실행
    try:
        loop = asyncio.get_event_loop()
        success, result = await loop.run_in_executor(None, _extract_with_uc)
        
        if success:
            logger.info(f"undetected_chromedriver로 자막 추출 성공: {video_id}")
            return True, {
                'success': True,
                'data': {
                    'text': result['text'],
                    'subtitles': [],  # 호환성을 위한 빈 배열
                    'videoInfo': result['videoInfo']
                }
            }
        else:
            logger.warning(f"undetected_chromedriver로 자막 추출 실패: {video_id}")
            return False, {
                'success': False,
                'message': result.get('message', 'Failed to extract subtitles')
            }
    except Exception as e:
        logger.error(f"undetected_chromedriver 비동기 실행 오류: {str(e)}")
        return False, {
            'success': False,
            'message': f"Async execution error with undetected_chromedriver: {str(e)}"
        }

# 초기화 함수: 필요한 도구들을 설치하고 설정합니다.
def init_tools():
    """
    필요한 도구와 서비스를 초기화합니다.
    컨테이너 환경에서는 일부 기능을 비활성화하지만 Tor는 활성화합니다.
    """
    global USE_TOR_NETWORK
    
    # 컨테이너 환경에서는 리소스 사용량을 최소화
    if RUNNING_IN_CONTAINER:
        logger.info("컨테이너 환경 감지: 리소스 최적화 모드로 실행합니다 (Tor 네트워크 유지)")
        global USE_BROWSER_FIRST, USE_PROXIES
        USE_BROWSER_FIRST = False  # 브라우저 방식 비활성화
        USE_PROXIES = False  # 프록시 비활성화
        # Tor 네트워크는 활성화 상태 유지 (기본값: True)
        USE_TOR_NETWORK = True  # 컨테이너에서도 Tor 네트워크 사용
    
    # 토르 네트워크 연결 테스트 (활성화된 경우만)
    if USE_TOR_NETWORK:
        try:
            if not test_tor_connection():
                logger.warning("Tor 연결이 작동하지 않습니다. USE_TOR_NETWORK를 False로 설정합니다.")
                USE_TOR_NETWORK = False
            else:
                logger.info("Tor 연결이 정상적으로 작동합니다.")
        except Exception as e:
            logger.error(f"Tor 연결 테스트 중 오류 발생: {str(e)}")
            USE_TOR_NETWORK = False
    
    # 쿠키 설정 확인
    global cookies_file
    if not os.path.exists(cookies_file):
        create_youtube_cookies()
        logger.info(f"YouTube 쿠키 파일이 생성되었습니다: {cookies_file}")
    else:
        logger.info(f"기존 YouTube 쿠키 파일을 사용합니다: {cookies_file}")
    
    # Playwright 브라우저 설치 확인 (메모리 문제로 컨테이너에서는 조건부 실행)
    if not RUNNING_IN_CONTAINER and USE_BROWSER_FIRST:
        try:
            import subprocess
            logger.info("Playwright 브라우저 설치 확인 중... (개발 환경 전용)")
            subprocess.run(["python", "-m", "playwright", "install", "chromium"], 
                         check=True, capture_output=True)
            logger.info("Playwright 브라우저가 설치되었습니다.")
        except Exception as e:
            logger.warning(f"Playwright 브라우저 설치 확인 중 오류 발생: {str(e)}")
            USE_BROWSER_FIRST = False
    elif RUNNING_IN_CONTAINER:
        logger.info("컨테이너 환경에서는 Playwright 브라우저 설치를 건너뜁니다.")
        
def test_tor_connection():
    """
    Tor 네트워크 연결을 테스트합니다.
    성공 시 True를 반환하고, 실패 시 False를 반환합니다.
    """
    try:
        # 짧은 타임아웃으로 Tor 상태 확인 (5초)
        logger.info("Tor 연결 테스트 중: https://check.torproject.org/api/ip")
        
        # 세션 생성 및 프록시 설정
        session = requests.Session()
        session.proxies = {
            'http': TOR_PROXY,
            'https': TOR_PROXY
        }
        
        # 연결 테스트 (SSL 인증서 검증 비활성화)
        response = session.get(
            'https://check.torproject.org/api/ip', 
            timeout=5,
            verify=False  # SSL 인증서 검증 비활성화
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('IsTor', False):
                logger.info(f"Tor 연결 성공! IP: {data.get('IP', '알 수 없음')}")
                return True
            else:
                logger.warning("Tor 연결 실패: Tor 네트워크가 아닙니다.")
                return False
        else:
            logger.warning(f"Tor 연결 실패: 상태 코드 {response.status_code}")
            return False
            
    except Exception as e:
        logger.warning(f"Tor 연결 테스트 실패: {str(e)}")
        # 기본 IP 테스트 사이트로 재시도
        try:
            session = requests.Session()
            session.proxies = {
                'http': TOR_PROXY,
                'https': TOR_PROXY
            }
            response = session.get('http://httpbin.org/ip', timeout=5, verify=False)
            if response.status_code == 200:
                logger.info(f"대체 테스트 성공! IP: {response.json().get('origin', '알 수 없음')}")
                return True
            else:
                return False
        except Exception as e2:
            logger.error(f"대체 Tor 테스트도 실패: {str(e2)}")
            return False

# 애플리케이션 시작 시 초기화
try:
    init_tools()
except Exception as e:
    logger.error(f"❌ 도구 초기화 중 오류: {str(e)}")
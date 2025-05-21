"""
YouTube 자막 추출 및 비디오 정보 가져오기 유틸리티 함수
"""
import re
import logging
from typing import Dict, List, Optional, Any, Tuple
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

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("youtube_utils")

# 전역 변수
last_request_time = 0
min_request_interval = 5  # 초 단위
USE_BROWSER_FIRST = True  # Playwright 브라우저를 우선적으로 사용
USE_BROWSER_FALLBACK = True  # yt-dlp 실패 시 Playwright 폴백 사용 여부
USE_YTDLP_COOKIES = True  # yt-dlp에 쿠키 사용 여부
USE_TOR_NETWORK = False  # Tor 네트워크 사용 여부 (설치 필요)
TOR_PROXY = "socks5://127.0.0.1:9050"  # Tor 프록시 주소 (기본값)

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
                    'channelName': info.get('uploader', "Unknown Channel"),
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

async def get_subtitles(video_id: str, language: str, max_retries=3, use_auth=False) -> Tuple[bool, Dict[str, Any]]:
    """
    지정된 언어로 YouTube 비디오의 자막을 가져옵니다.
    """
    global last_request_time
    
    # 요청 간격 관리 (변동폭 증가)
    current_time = time.time()
    time_since_last_request = current_time - last_request_time
    
    if time_since_last_request < min_request_interval:
        # 더 자연스러운 대기 시간 (정확히 최소 시간보다 약간 더 기다림)
        wait_time = min_request_interval - time_since_last_request + random.uniform(0.5, 2.0)
        logger.info(f"요청 빈도 제한: {wait_time:.2f}초 대기")
        await asyncio.sleep(wait_time)
    
    # 인간 행동 시뮬레이션을 위한 랜덤 지연 (더 넓은 범위)
    wait_time = random.normalvariate(3.0, 1.0)  # 정규 분포로 더 자연스러움
    wait_time = max(1.0, min(8.0, wait_time))  # 1초에서 8초 사이로 제한
    await asyncio.sleep(wait_time)
    
    logger.info(f"자막 추출 시작 - 비디오 ID: {video_id}, 언어: {language}")

    # 비디오 기본 정보 가져오기 (최소한의 정보)
    video_info = {
        'title': f"Video {video_id}",
        'channelName': "Unknown Channel",
        'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        'videoId': video_id
    }
    
    # 0단계: YouTube Transcript API로 먼저 시도 (가장 안정적인 방법)
    try:
        logger.info("YouTube Transcript API로 자막 추출 시도")
        success, result = extract_subtitles_with_transcript_api(video_id, language, video_info)
        if success:
            return success, result
        else:
            logger.warning("YouTube Transcript API 실패, 다음 방법으로 진행")
    except Exception as e:
        logger.error(f"YouTube Transcript API 시도 중 오류 발생: {str(e)}, 다음 방법으로 진행")
    
    # 1단계: 웹 스크래핑 방식으로 시도 (두번째로 안정적인 방법)
    try:
        logger.info("웹 스크래핑 방식으로 자막 추출 시도")
        success, result = await extract_subtitles_with_scraping(video_id, language, video_info)
        if success:
            return success, result
        else:
            logger.warning("웹 스크래핑 방식 실패, 다음 방법으로 진행")
    except Exception as e:
        logger.error(f"웹 스크래핑 시도 중 오류 발생: {str(e)}, 다음 방법으로 진행")
    
    # 2단계: 브라우저 방식을 세번째로 시도 (설정에 따라)
    if USE_BROWSER_FIRST:
        try:
            logger.info("브라우저 방식으로 자막 추출 시도")
            success, result = await extract_subtitles_with_browser(video_id, language, video_info)
            if success:
                return success, result
            else:
                logger.warning("브라우저 방식 실패, yt-dlp 방식으로 폴백")
        except Exception as e:
            logger.error(f"브라우저 방식 시도 중 오류 발생: {str(e)}, yt-dlp 방식으로 폴백")
    
    # 2단계: yt-dlp로 시도
    for attempt in range(max_retries):
        try:
            # 요청마다 다른 브라우저 지문 사용
            user_agent = get_random_browser_fingerprint()
            
            # 헤더 랜덤화
            http_headers = get_random_headers()
            
            # 쿠키 설정
            cookie_file = None
            if random.random() > 0.3 and USE_YTDLP_COOKIES:  # 70% 확률로 쿠키 사용
                cookie_file = f"yt_cookies_{random.randint(1, 5)}.txt"
                if not os.path.exists(cookie_file):
                    with open(cookie_file, 'w') as f:
                        f.write(create_youtube_cookies())
            
            # 인증 설정 추가
            auth_opts = setup_yt_auth(use_auth)
            
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
            
            # 기타 오류는 바로 반환
            return result
        
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"yt-dlp 시도 {attempt+1}/{max_retries} 실패: {error_msg}")
            
            if "HTTP Error 429" in error_msg or "Precondition check failed" in error_msg:  # 너무 많은 요청 또는 봇 감지
                wait_time = (2 ** attempt) * 10  # 지수 백오프
                logger.info(f"{wait_time}초 대기 후 재시도합니다...")
                await asyncio.sleep(wait_time)
            elif "This video is unavailable" in error_msg:
                # 비디오 자체가 사용 불가능한 경우 더 이상 시도하지 않음
                return False, {
                    'success': False,
                    'message': "Video is unavailable or private"
                }
            elif attempt < max_retries - 1:
                await asyncio.sleep(random.uniform(2, 5))  # 일반 오류 시 짧은 대기
            else:
                # 모든 방법 실패, 마지막 오류 메시지 반환
                return False, {
                    'success': False,
                    'message': error_msg
                }
    
    # 요청 시간 업데이트
    last_request_time = time.time()
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
                'channelName': info.get('uploader', "Unknown Channel"),
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
    Playwright를 사용하여 브라우저로 유튜브 자막을 추출합니다.
    이 방법은 봇 감지를 효과적으로 우회할 수 있습니다.
    """
    logger.info(f"브라우저 방식으로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        # 필요한 모듈 임포트 (필요시 설치)
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright가 설치되지 않았습니다. 'pip install playwright'로 설치한 후 'playwright install' 명령을 실행하세요.")
            return False, {
                'success': False, 
                'message': "Playwright is not installed. Install with 'pip install playwright' and run 'playwright install'"
            }
        
        # 쿠키 저장 경로
        cookie_dir = Path("./browser_data")
        cookie_dir.mkdir(exist_ok=True)
        cookie_file = cookie_dir / f"youtube_cookies_{random.randint(1, 10)}.json"
        
        async with async_playwright() as p:
            # 브라우저 시작 (헤드리스 모드)
            # 프로덕션 환경에서는 headless=True로 설정
            browser = await p.chromium.launch(headless=True)
            
            # 브라우저 컨텍스트 생성 (사용자 에이전트 및 뷰포트 설정)
            user_agent = get_random_browser_fingerprint()
            context = await browser.new_context(
                user_agent=user_agent,
                viewport={'width': random.randint(1024, 1920), 'height': random.randint(768, 1080)},
            )
            
            # 저장된 쿠키 불러오기 (있는 경우)
            if cookie_file.exists():
                try:
                    with open(cookie_file, 'r') as f:
                        cookies = json.load(f)
                    await context.add_cookies(cookies)
                    logger.info(f"저장된 쿠키 불러오기 성공: {cookie_file}")
                except Exception as e:
                    logger.warning(f"쿠키 로드 실패: {str(e)}")
            
            # 새 페이지 열기
            page = await context.new_page()
            
            # 유튜브 접속 전 랜덤 사이트 방문 (더 자연스러운 행동 시뮬레이션)
            if random.random() > 0.7:  # 30% 확률로 실행
                referral_sites = ['https://www.google.com', 'https://search.naver.com', 'https://www.bing.com']
                await page.goto(random.choice(referral_sites), wait_until='networkidle')
                logger.info("자연스러운 행동 시뮬레이션: 검색 엔진 방문")
                await asyncio.sleep(random.uniform(1, 3))
                
                # 검색창에 검색어 입력 (구글 기준)
                search_terms = ['youtube video', '유튜브 영상', 'how to', 'music video']
                search_term = f"{random.choice(search_terms)} {video_id}"
                try:
                    await page.fill('input[name="q"]', search_term)
                    await page.press('input[name="q"]', 'Enter')
                    await asyncio.sleep(random.uniform(2, 4))
                    logger.info(f"검색어 입력: {search_term}")
                except Exception as e:
                    logger.warning(f"검색 시도 실패 (무시): {str(e)}")
            
            # 유튜브 영상 페이지로 이동
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            await page.goto(video_url, wait_until='networkidle')
            logger.info(f"유튜브 영상 페이지 접속: {video_url}")
            
            # 페이지 로딩 대기
            await asyncio.sleep(random.uniform(2, 5))
            
            # 인간 행동 시뮬레이션
            await simulate_human_behavior(page)
            
            # 자막 버튼 클릭
            try:
                # 자막 버튼 찾고 클릭
                logger.info("자막 버튼 찾기 시도...")
                caption_button = page.locator('.ytp-subtitles-button')
                
                # 자막 버튼이 활성화되어 있지 않으면 클릭
                if await caption_button.is_visible():
                    logger.info("자막 버튼 발견, 클릭 시도...")
                    await caption_button.click()
                    await asyncio.sleep(random.uniform(0.5, 1.5))
                else:
                    logger.warning("자막 버튼을 찾을 수 없음")
            except Exception as e:
                logger.warning(f"자막 버튼 클릭 실패: {str(e)}")
            
            # 자막 설정 메뉴 열기
            try:
                # 설정 버튼 클릭
                logger.info("설정 버튼 찾기...")
                settings_button = page.locator('.ytp-settings-button')
                if await settings_button.is_visible():
                    await settings_button.click()
                    await asyncio.sleep(random.uniform(0.5, 1.5))
                    
                    # 자막 메뉴 항목 찾기
                    subtitles_menu = page.locator('text=자막')
                    if not await subtitles_menu.is_visible():
                        subtitles_menu = page.locator('text=Subtitles/CC')
                    
                    if await subtitles_menu.is_visible():
                        await subtitles_menu.click()
                        await asyncio.sleep(random.uniform(0.5, 1.5))
                        
                        # 언어 선택 (여러 가능한 형식 시도)
                        language_names = {
                            'ko': ['한국어', 'Korean'],
                            'en': ['영어', 'English'],
                            'ja': ['일본어', 'Japanese'],
                            'zh': ['중국어', 'Chinese']
                        }
                        
                        lang_options = language_names.get(language, [language])
                        for lang_name in lang_options:
                            try:
                                lang_selector = page.locator(f'text={lang_name}')
                                if await lang_selector.is_visible():
                                    await lang_selector.click()
                                    logger.info(f"언어 선택 성공: {lang_name}")
                                    break
                            except:
                                continue
                else:
                    logger.warning("설정 버튼을 찾을 수 없음")
            except Exception as e:
                logger.warning(f"자막 설정 메뉴 조작 실패: {str(e)}")
            
            # 페이지 스크롤 및 추가 상호작용
            await page.mouse.wheel(0, random.randint(100, 300))
            await asyncio.sleep(random.uniform(1, 3))
            
            # 자막 텍스트 추출 (JavaScript 평가)
            subtitle_text = ""
            try:
                logger.info("자막 텍스트 추출 시도...")
                
                # 방법 1: 현재 표시된 자막 요소 추출
                subtitles_js = """
                () => {
                    const captionElements = document.querySelectorAll('.ytp-caption-segment');
                    if (captionElements && captionElements.length > 0) {
                        return Array.from(captionElements).map(el => el.textContent).join(' ');
                    }
                    return '';
                }
                """
                current_caption = await page.evaluate(subtitles_js)
                if current_caption:
                    subtitle_text += current_caption + "\n"
                
                # 방법 2: 비디오 재생하며 자막 수집
                # 영상 10% 지점부터 시작
                video_length_js = "() => { return document.querySelector('video').duration; }"
                video_length = await page.evaluate(video_length_js) or 0
                
                if video_length > 0:
                    # 영상 전체 길이의 10% 지점에서 시작
                    start_time = min(video_length * 0.1, 30)  # 최대 30초
                    # 최대 3분까지만 수집 (혹은 영상 끝까지)
                    end_time = min(start_time + 180, video_length)
                    
                    # 특정 지점으로 이동
                    seek_js = f"() => {{ document.querySelector('video').currentTime = {start_time}; }}"
                    await page.evaluate(seek_js)
                    await asyncio.sleep(1)  # 영상 로딩 대기
                    
                    # 영상 재생
                    play_js = "() => { document.querySelector('video').play(); }"
                    await page.evaluate(play_js)
                    logger.info(f"영상 재생 시작 (자막 수집): {start_time}초부터")
                    
                    # 일정 간격으로 자막 수집
                    collected_captions = set()
                    collection_start_time = time.time()
                    
                    # 최대 30초 동안 자막 수집 (또는 end_time에 도달할 때까지)
                    while time.time() - collection_start_time < 30:
                        current_caption = await page.evaluate(subtitles_js)
                        if current_caption and current_caption not in collected_captions:
                            collected_captions.add(current_caption)
                            subtitle_text += current_caption + "\n"
                        
                        # 현재 재생 위치 확인
                        current_time_js = "() => { return document.querySelector('video').currentTime; }"
                        current_time = await page.evaluate(current_time_js) or 0
                        
                        # end_time에 도달하면 중단
                        if current_time >= end_time:
                            break
                        
                        await asyncio.sleep(0.5)
                
                # 수집된 자막이 없거나 매우 짧은 경우 YouTube 트랜스크립트 기능 시도
                if len(subtitle_text.strip()) < 50:
                    logger.info("재생 방식으로 충분한 자막을 얻지 못해 트랜스크립트 기능 시도...")
                    
                    # 트랜스크립트 버튼 찾기 및 클릭
                    try:
                        # 첫 번째: 페이지를 새로고침하고 다시 시도
                        await page.reload(wait_until='networkidle')
                        await asyncio.sleep(3)
                        
                        # '...' 버튼 클릭
                        more_actions = page.locator('[aria-label="추가 작업"]')
                        if not await more_actions.is_visible():
                            more_actions = page.locator('[aria-label="More actions"]')
                        
                        if await more_actions.is_visible():
                            await more_actions.click()
                            await asyncio.sleep(1)
                            
                            # '스크립트 표시' 또는 'Show transcript' 옵션 찾기
                            transcript_option = page.locator('text=스크립트 표시')
                            if not await transcript_option.is_visible():
                                transcript_option = page.locator('text=Show transcript')
                            
                            if await transcript_option.is_visible():
                                await transcript_option.click()
                                await asyncio.sleep(2)
                                
                                # 트랜스크립트 항목 추출
                                transcript_items_js = """
                                () => {
                                    const items = document.querySelectorAll('yt-formatted-string.segment-text');
                                    return Array.from(items).map(el => el.textContent).join('\\n');
                                }
                                """
                                transcript_text = await page.evaluate(transcript_items_js)
                                if transcript_text:
                                    subtitle_text = transcript_text
                    except Exception as e:
                        logger.warning(f"트랜스크립트 추출 실패: {str(e)}")
            except Exception as e:
                logger.error(f"자막 텍스트 추출 실패: {str(e)}")
            
            # 쿠키 저장 (다음 실행 시 사용)
            try:
                cookies = await context.cookies()
                with open(cookie_file, 'w') as f:
                    json.dump(cookies, f)
                logger.info(f"쿠키 저장 완료: {cookie_file}")
            except Exception as e:
                logger.warning(f"쿠키 저장 실패: {str(e)}")
            
            # 브라우저 종료
            await browser.close()
            
            # 자막이 추출되었는지 확인
            if subtitle_text.strip():
                logger.info(f"브라우저 방식으로 자막 추출 성공: {len(subtitle_text)} 자")
                return True, {
                    'success': True,
                    'data': {
                        'text': subtitle_text.strip(),
                        'subtitles': [],  # 호환성을 위한 빈 배열
                        'videoInfo': video_info
                    }
                }
            else:
                logger.error(f"브라우저 방식으로도 자막을 찾을 수 없음: {video_id}")
                return False, {
                    'success': False,
                    'message': f"Could not find captions for video: {video_id} (Browser method failed)"
                }
    
    except Exception as e:
        logger.error(f"브라우저 자막 추출 과정에서 오류 발생: {str(e)}")
        return False, {
            'success': False,
            'message': f"Error in browser caption extraction: {str(e)}"
        }

async def simulate_human_behavior(page):
    """
    실제 사람처럼 브라우저를 조작하는 행동을 시뮬레이션합니다.
    """
    # 랜덤 위치로 마우스 이동
    await page.mouse.move(
        random.randint(100, 800), 
        random.randint(100, 600)
    )
    await asyncio.sleep(random.uniform(0.5, 1.5))
    
    # 스크롤
    for _ in range(random.randint(1, 3)):
        await page.mouse.wheel(0, random.randint(100, 300))
        await asyncio.sleep(random.uniform(0.5, 2))
    
    # 비디오 영역 클릭 (재생/일시정지)
    try:
        video_player = page.locator('.html5-video-player')
        if await video_player.is_visible():
            # 비디오 플레이어의 중앙 부분 좌표 계산
            bounding_box = await video_player.bounding_box()
            if bounding_box:
                center_x = bounding_box['x'] + bounding_box['width'] / 2
                center_y = bounding_box['y'] + bounding_box['height'] / 2
                await page.mouse.move(center_x, center_y)
                await page.mouse.click(center_x, center_y)
                await asyncio.sleep(random.uniform(1, 3))
    except Exception as e:
        logger.warning(f"비디오 플레이어 클릭 실패 (무시): {str(e)}")
    
    # 비디오 타임라인에서 랜덤 위치 클릭 (앞쪽 30%로 제한)
    try:
        video_timeline = page.locator('.ytp-progress-bar')
        if await video_timeline.is_visible():
            bounding_box = await video_timeline.bounding_box()
            if bounding_box:
                timeline_x = bounding_box['x'] + bounding_box['width'] * random.uniform(0.05, 0.3)
                timeline_y = bounding_box['y'] + bounding_box['height'] / 2
                await page.mouse.move(timeline_x, timeline_y)
                await page.mouse.click(timeline_x, timeline_y)
                await asyncio.sleep(random.uniform(1, 2))
    except Exception as e:
        logger.warning(f"타임라인 클릭 실패 (무시): {str(e)}")

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
    YouTube 접근을 위한 쿠키를 Netscape 형식으로 생성합니다.
    yt-dlp는 이 형식을 요구합니다.
    """
    # 랜덤 쿠키 ID 생성
    pref_id = ''.join(random.choices('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=19))
    visitor_id = ''.join(random.choices('0123456789abcdef', k=16))
    ysc_id = ''.join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", k=11))
    
    # 쿠키 만료 시간 설정 (1-2개월 랜덤)
    expires = int(time.time()) + random.randint(30, 60) * 24 * 3600
    
    # Netscape 형식 쿠키 파일 생성
    # 형식: domain flag path secure expiration name value
    cookies = [
        "# Netscape HTTP Cookie File",
        "# https://curl.haxx.se/docs/http-cookies.html",
        "# This file was generated by youtube_utils.py",
        "",
        f".youtube.com\tTRUE\t/\tFALSE\t{expires}\tPREF\tf6={pref_id}",
        f".youtube.com\tTRUE\t/\tFALSE\t{expires}\tVISITOR_INFO1_LIVE\t{visitor_id}",
        f".youtube.com\tTRUE\t/\tFALSE\t0\tYSC\t{ysc_id}",
        # 추가 쿠키 설정 (더 안정적인 접근을 위해)
        f".youtube.com\tTRUE\t/\tFALSE\t{expires}\tCONSENT\tYES+cb.20210328-17-p0.en+FX+{random.randint(100, 999)}",
        f"www.youtube.com\tTRUE\t/\tFALSE\t0\tLOGIN_INFO\t{random.randint(1000000, 9999999)}%3A{random.randint(1000000, 9999999)}%3A{random.randint(1000000, 9999999)}",
    ]
    
    return "\n".join(cookies)

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
    이 방법은 봇 감지를 회피하기 위한 가장 효과적인 방법입니다.
    """
    logger.info(f"YouTube Transcript API로 자막 추출 시작: {video_id}, 언어: {language}")
    
    try:
        # 자막 언어 코드 매핑
        lang_code_map = {
            'ko': ['ko', 'ko-KR'],
            'en': ['en', 'en-US', 'en-GB'],
            'ja': ['ja', 'ja-JP'],
            'zh': ['zh', 'zh-Hans', 'zh-CN', 'zh-TW'],
            'fr': ['fr', 'fr-FR'],
            'de': ['de', 'de-DE'],
        }
        
        # 요청 언어에 대한 다양한 코드 시도
        target_langs = lang_code_map.get(language, [language])
        
        # 다른 언어로 폴백 할지 여부 (예: 한국어가 없으면 영어)
        use_fallback = True
        
        # 자막 가져오기 시도
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        available_transcripts = list(transcript_list._transcripts.values())
        
        logger.info(f"사용 가능한 자막: {[t.language_code for t in available_transcripts]}")
        
        # 1단계: 수동 생성 자막에서 원하는 언어 찾기
        transcript = None
        for lang in target_langs:
            try:
                transcript = transcript_list.find_transcript(lang)
                logger.info(f"원하는 언어의 자막 발견: {lang}")
                break
            except _errors.NoTranscriptFound:
                continue
        
        # 2단계: 자동 생성 자막에서 원하는 언어 찾기
        if transcript is None:
            for lang in target_langs:
                try:
                    for t in available_transcripts:
                        if t.language_code == lang and t.is_generated:
                            transcript = t
                            logger.info(f"원하는 언어의 자동 생성 자막 발견: {lang}")
                            break
                except:
                    continue
        
        # 3단계: 영어 자막으로 폴백
        if transcript is None and use_fallback and language != 'en':
            fallback_langs = ['en', 'en-US', 'en-GB']
            logger.info(f"원하는 언어 자막을 찾지 못해 영어 자막으로 시도")
            
            for lang in fallback_langs:
                try:
                    transcript = transcript_list.find_transcript(lang)
                    logger.info(f"영어 자막 발견: {lang}")
                    break
                except _errors.NoTranscriptFound:
                    continue
        
        # 4단계: 어떤 자막이든 사용
        if transcript is None and available_transcripts:
            logger.info(f"원하는 언어의 자막을 찾지 못해 첫 번째 가능한 자막 사용")
            transcript = available_transcripts[0]
        
        if transcript:
            # 자막 데이터 가져오기
            transcript_data = transcript.fetch()
            
            # 자막 텍스트로 변환
            subtitle_lines = []
            for item in transcript_data:
                text = item.get('text', '').strip()
                if text:
                    subtitle_lines.append(text)
            
            subtitle_text = '\n'.join(subtitle_lines)
            
            # 자막 텍스트가 있는 경우
            if subtitle_text:
                logger.info(f"YouTube Transcript API로 자막 추출 성공: {len(subtitle_text)} 자")
                
                # 비디오 정보 업데이트 시도
                try:
                    detailed_video_info = get_video_info_minimal(video_id)
                    if detailed_video_info:
                        video_info.update(detailed_video_info)
                except Exception as e:
                    logger.warning(f"자세한 비디오 정보 가져오기 실패 (기본 정보 사용): {str(e)}")
                
                return True, {
                    'success': True,
                    'data': {
                        'text': subtitle_text,
                        'subtitles': [],  # 호환성을 위한 빈 배열
                        'videoInfo': video_info
                    }
                }
        
        # 자막을 찾지 못한 경우
        logger.error(f"YouTube Transcript API로 자막을 찾을 수 없음: {video_id}")
        return False, {
            'success': False,
            'message': f"Could not find captions for video: {video_id} (YouTube Transcript API method failed)"
        }
    
    except _errors.TranscriptsDisabled:
        logger.error(f"비디오에 자막이 비활성화됨: {video_id}")
        return False, {
            'success': False,
            'message': f"Transcripts are disabled for this video: {video_id}"
        }
    except _errors.NoTranscriptAvailable:
        logger.error(f"비디오에 자막이 없음: {video_id}")
        return False, {
            'success': False,
            'message': f"No transcripts available for video: {video_id}"
        }
    except Exception as e:
        logger.error(f"YouTube Transcript API 사용 중 오류 발생: {str(e)}")
        return False, {
            'success': False,
            'message': f"Error in YouTube Transcript API: {str(e)}"
        }

def get_video_info_minimal(video_id: str) -> Dict[str, Any]:
    """
    YouTube API를 사용하지 않고 최소한의 비디오 정보만 가져옵니다.
    """
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {
            'User-Agent': get_random_browser_fingerprint(),
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 제목 추출
        title = soup.find('meta', property='og:title')
        title = title['content'] if title else f"Video {video_id}"
        
        # 채널 이름 추출 (여러 방법 시도)
        channel = soup.find('meta', property='og:video:tag')
        if not channel:
            channel = soup.find('span', {'itemprop': 'author'})
        channel_name = channel['content'] if channel and 'content' in channel.attrs else "Unknown Channel"
        
        # 썸네일 URL
        thumbnail = soup.find('meta', property='og:image')
        thumbnail_url = thumbnail['content'] if thumbnail else f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
        
        return {
            'title': title,
            'channelName': channel_name,
            'thumbnailUrl': thumbnail_url,
            'videoId': video_id
        }
    except Exception as e:
        logger.warning(f"최소 비디오 정보 가져오기 실패: {str(e)}")
        return None

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

# yt-dlp를 사용할 때 필요한 기본 옵션 설정
def get_ytdlp_base_options(video_id: str, language: str, user_agent: str = None, http_headers: Dict[str, str] = None, cookie_file: str = None):
    """
    yt-dlp 기본 옵션을 설정합니다.
    """
    # 기본 옵션
    ydl_opts = {
        'skip_download': True,  # 비디오는 다운로드하지 않음
        'writesubtitles': True,  # 자막 다운로드 활성화
        'writeautomaticsub': True,  # 자동 생성 자막도 허용
        'subtitleslangs': [language, 'en'],  # 요청 언어와 영어 자막 시도
        'subtitlesformat': 'srv2',  # SRT 형식으로 가져오기
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 30,  # 소켓 타임아웃 증가 (초 단위)
        'retries': 10,  # 내부 재시도 증가
        'fragment_retries': 10,  # 조각 재시도 증가
        'extractor_retries': 5,  # 추출기 재시도 증가
        'skip_unavailable_fragments': True,  # 사용 불가능한 조각 건너뛰기
        'ignoreerrors': True,  # 오류 무시하고 계속 진행
        'geo_bypass': True,  # 지역 제한 우회 시도
        'geo_bypass_country': 'US',  # 미국 지역으로 우회
        'nocheckcertificate': True,  # 인증서 확인 건너뛰기
        'extract_flat': True,  # 단일 비디오 정보만 추출
    }
    
    # 사용자 에이전트 설정
    if user_agent:
        ydl_opts['user_agent'] = user_agent
    else:
        ydl_opts['user_agent'] = get_random_browser_fingerprint()
    
    # HTTP 헤더 설정
    if http_headers:
        ydl_opts['http_headers'] = http_headers
    else:
        ydl_opts['http_headers'] = get_random_headers()
    
    # 쿠키 파일 설정
    if cookie_file and USE_YTDLP_COOKIES:
        ydl_opts['cookiefile'] = cookie_file
    
    return ydl_opts 

# Tor 네트워크 연결 테스트 (사용 가능한지 확인)
def test_tor_connection():
    """
    Tor 네트워크 연결을 테스트합니다.
    """
    if not USE_TOR_NETWORK:
        return False
    
    try:
        import requests
        import socks
        import socket
        
        # Tor SOCKS 프록시 설정
        socks.set_default_proxy(socks.SOCKS5, "127.0.0.1", 9050)
        socket.socket = socks.socksocket
        
        # Tor 네트워크를 통해 요청
        response = requests.get('https://check.torproject.org/', timeout=10)
        
        # Tor 사용 여부 확인
        if 'Congratulations. This browser is configured to use Tor' in response.text:
            logger.info("Tor 네트워크 연결 성공")
            return True
        else:
            logger.warning("Tor 연결 실패: Tor 네트워크를 통과하지 않음")
            return False
    except Exception as e:
        logger.error(f"Tor 연결 테스트 실패: {str(e)}")
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
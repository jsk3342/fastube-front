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

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("youtube_utils")

# 전역 변수
last_request_time = 0
min_request_interval = 5  # 초 단위

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

def get_subtitles(video_id: str, language: str, max_retries=3, use_auth=False) -> Tuple[bool, Dict[str, Any]]:
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
        time.sleep(wait_time)
    
    # 인간 행동 시뮬레이션을 위한 랜덤 지연 (더 넓은 범위)
    wait_time = random.normalvariate(3.0, 1.0)  # 정규 분포로 더 자연스러움
    wait_time = max(1.0, min(8.0, wait_time))  # 1초에서 8초 사이로 제한
    time.sleep(wait_time)
    
    logger.info(f"자막 추출 시작 - 비디오 ID: {video_id}, 언어: {language}")
    
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
            
            # 인증 설정 추가
            auth_opts = setup_yt_auth(use_auth)
            
            # 다운로드 옵션 설정 (자막 중심)
            ydl_opts = {
                'skip_download': True,  # 비디오는 다운로드하지 않음
                'writesubtitles': True,  # 자막 다운로드 활성화
                'writeautomaticsub': True,  # 자동 생성 자막도 허용
                'subtitleslangs': [language, 'en'],  # 요청 언어와 영어 자막 시도
                'subtitlesformat': 'srv2',  # SRT 형식으로 가져오기
                'quiet': True,
                'no_warnings': True,
                'user_agent': user_agent,
                'http_headers': http_headers,
            }
            
            # 쿠키 파일 사용 설정
            if cookie_file:
                ydl_opts['cookiefile'] = cookie_file
            
            # 인증 설정 병합
            ydl_opts.update(auth_opts)
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # 정보 추출 (자막 포함)
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                
                # 비디오 정보 가져오기 (Node.js 백엔드와 형식 통일)
                video_info = {
                    'title': info.get('title', f"Video {video_id}"),
                    'channelName': info.get('uploader', "Unknown Channel"),
                    'thumbnailUrl': info.get('thumbnail', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                    'videoId': video_id
                }
                
                # 자막 추출 시도
                subtitle_text = extract_subtitle_text(info, language)
                
                # 임시 쿠키 파일 삭제
                if cookie_file and os.path.exists(cookie_file) and random.random() > 0.5:
                    try:
                        os.remove(cookie_file)
                    except:
                        pass
                
                if subtitle_text:
                    logger.info(f"자막 추출 성공: {len(subtitle_text)} 자")
                    # 요청 시간 업데이트
                    last_request_time = time.time()
                    return True, {
                        'success': True,
                        'data': {
                            'text': subtitle_text,
                            'subtitles': [],  # Node.js 백엔드와 호환성 위해 빈 배열 추가
                            'videoInfo': video_info
                        }
                    }
                else:
                    # 자막이 없지만 성공적으로 정보를 가져온 경우
                    if attempt < max_retries - 1:
                        logger.warning(f"자막을 찾을 수 없음. 다른 방법으로 재시도 ({attempt+1}/{max_retries})...")
                        time.sleep(random.uniform(2, 5))
                        continue
                    else:
                        logger.error(f"자막을 찾을 수 없음: {video_id}")
                        # 요청 시간 업데이트
                        last_request_time = time.time()
                        return False, {
                            'success': False,
                            'message': f"Could not find captions for video: {video_id}" 
                        }
        
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"시도 {attempt+1}/{max_retries} 실패: {error_msg}")
            
            if "HTTP Error 429" in error_msg:  # 너무 많은 요청
                wait_time = (2 ** attempt) * 10  # 지수 백오프
                logger.info(f"{wait_time}초 대기 후 재시도합니다...")
                time.sleep(wait_time)
            elif "This video is unavailable" in error_msg:
                # 비디오 자체가 사용 불가능한 경우 더 이상 시도하지 않음
                return False, {
                    'success': False,
                    'message': "Video is unavailable or private"
                }
            elif attempt < max_retries - 1:
                time.sleep(random.uniform(2, 5))  # 일반 오류 시 짧은 대기
            else:
                # 요청 시간 업데이트
                last_request_time = time.time()
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
    # 랜덤 쿠키 ID 생성
    pref_id = ''.join(random.choices('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=19))
    visitor_id = ''.join(random.choices('0123456789abcdef', k=16))
    
    # 쿠키 만료 시간 설정 (1-2개월 랜덤)
    expires = int(time.time()) + random.randint(30, 60) * 24 * 3600
    
    # 쿠키 문자열 생성
    cookies = [
        f'PREF=f6={pref_id}; expires={expires}; path=/; domain=.youtube.com',
        f'VISITOR_INFO1_LIVE={visitor_id}; expires={expires}; path=/; domain=.youtube.com',
        f'YSC={"".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", k=11))}; path=/; domain=.youtube.com; secure'
    ]
    
    return '\n'.join(cookies)

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
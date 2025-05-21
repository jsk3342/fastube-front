"""
YouTube 자막 추출 및 비디오 정보 가져오기 유틸리티 함수
"""
import re
import logging
from typing import Dict, List, Optional, Any, Tuple
import yt_dlp

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("youtube_utils")

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

def get_video_info(video_id: str) -> Dict[str, Any]:
    """
    YouTube 비디오 정보를 가져옵니다.
    """
    logger.info(f"비디오 정보 가져오기 시작: {video_id}")
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            
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
            return video_info
            
    except Exception as e:
        logger.error(f"비디오 정보 가져오기 실패: {str(e)}")
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

def get_subtitles(video_id: str, language: str) -> Tuple[bool, Dict[str, Any]]:
    """
    지정된 언어로 YouTube 비디오의 자막을 가져옵니다.
    """
    logger.info(f"자막 추출 시작 - 비디오 ID: {video_id}, 언어: {language}")
    
    # 다운로드 옵션 설정 (자막 중심)
    ydl_opts = {
        'skip_download': True,  # 비디오는 다운로드하지 않음
        'writesubtitles': True,  # 자막 다운로드 활성화
        'writeautomaticsub': True,  # 자동 생성 자막도 허용
        'subtitleslangs': [language, 'en'],  # 요청 언어와 영어 자막 시도
        'subtitlesformat': 'srv2',  # SRT 형식으로 가져오기
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
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
            
            if subtitle_text:
                logger.info(f"자막 추출 성공: {len(subtitle_text)} 자")
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
        logger.error(f"자막 추출 실패: {str(e)}")
        return False, {
            'success': False,
            'message': str(e)
        }

def extract_subtitle_text(info: Dict[str, Any], language: str) -> str:
    """
    비디오 정보에서 자막 텍스트를 추출합니다.
    """
    subtitle_text = ""
    
    # 일반 자막 확인
    if 'subtitles' in info and info['subtitles']:
        if language in info['subtitles']:
            logger.info(f"일반 자막 발견 (언어: {language})")
            subtitle_text = process_subtitle_entries(info['subtitles'][language])
    
    # 자막이 없으면 자동 생성 자막 확인
    if not subtitle_text and 'automatic_captions' in info and info['automatic_captions']:
        if language in info['automatic_captions']:
            logger.info(f"자동 생성 자막 발견 (언어: {language})")
            subtitle_text = process_subtitle_entries(info['automatic_captions'][language])
    
    # 발견한 자막이 없고 language가 'ko'인 경우 영어 자막 시도
    if not subtitle_text and language == 'ko':
        logger.info("한국어 자막 없음, 영어 자막 시도")
        if 'subtitles' in info and info['subtitles'] and 'en' in info['subtitles']:
            subtitle_text = process_subtitle_entries(info['subtitles']['en'])
        elif 'automatic_captions' in info and info['automatic_captions'] and 'en' in info['automatic_captions']:
            subtitle_text = process_subtitle_entries(info['automatic_captions']['en'])
    
    return subtitle_text

def process_subtitle_entries(subtitle_entries: List[Dict[str, Any]]) -> str:
    """
    자막 항목에서 텍스트를 추출하고 처리합니다.
    """
    text_parts = []
    
    for entry in subtitle_entries:
        if entry.get('ext') == 'json3' or entry.get('ext') == 'srv2' or entry.get('ext') == 'vtt':
            # yt-dlp는 자막 내용을 직접 제공하지 않을 수 있음
            # 이 경우 다운로드 URL을 가져와 추가 작업 필요
            # 현재는 yt-dlp의 자막 처리 방식에 따라 다름
            pass
    
    # 실제 구현에서는 yt-dlp가 내부적으로 자막을 처리하므로
    # 모의 데이터로 대체 (실제 사용 시 yt-dlp가 자막 텍스트 제공)
    # 전체 자막을 한 번에 텍스트로 가져오는 방식 사용
    
    # 메모: 실제 프로덕션 환경에서는 이 부분 대신 yt-dlp의 
    # --write-subs 옵션으로 파일로 저장 후 파싱하는 방식이 필요할 수 있음 
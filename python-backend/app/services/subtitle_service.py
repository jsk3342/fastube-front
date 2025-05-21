"""
YouTube 자막 서비스
"""
import logging
import tempfile
import os
from typing import Dict, Any, Optional, List, Tuple
import subprocess
import json
import yt_dlp
import urllib.parse

from ..utils.youtube_utils import (
    get_video_info,
    get_subtitles
)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("subtitle_service")

class SubtitleService:
    """
    YouTube 자막 및 비디오 정보 처리 서비스
    """
    
    def __init__(self):
        """
        SubtitleService 초기화
        """
        self.logger = logger  # 클래스 내부에서 사용할 로거 설정
    
    async def get_video_info(self, video_id: str) -> Dict[str, Any]:
        """
        비디오 ID를 이용해 YouTube 비디오 정보를 가져옵니다.
        """
        try:
            self.logger.info(f"비디오 정보 요청 - 비디오 ID: {video_id}")
            
            # 비디오 정보 가져오기
            result = get_video_info(video_id)
            
            # 비디오 ID 포함 여부 확인 및 추가
            if result and 'videoId' not in result:
                result['videoId'] = video_id
                
            # availableLanguages 형식 확인 및 리스트로 변환
            if result and 'availableLanguages' in result:
                if not result['availableLanguages']:
                    # 기본 언어 설정 (한국어, 영어)
                    result['availableLanguages'] = [
                        {"code": "ko", "name": "한국어"},
                        {"code": "en", "name": "영어"}
                    ]
                elif isinstance(result['availableLanguages'], list):
                    # 이미 리스트인 경우 그대로 사용
                    pass
                else:
                    # 객체인 경우 리스트로 변환
                    try:
                        avail_langs = result['availableLanguages']
                        result['availableLanguages'] = [
                            {"code": lang, "name": name} 
                            for lang, name in avail_langs.items()
                        ]
                    except:
                        # 변환 실패 시 기본 언어 설정
                        result['availableLanguages'] = [
                            {"code": "ko", "name": "한국어"},
                            {"code": "en", "name": "영어"}
                        ]
            
            return result
        except Exception as e:
            self.logger.error(f"비디오 정보 가져오기 오류: {str(e)}")
            # 기본 비디오 정보 반환
            return {
                'title': f"Video {video_id}", 
                'channelName': "Unknown Channel",
                'thumbnailUrl': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                'videoId': video_id
            }
    
    async def get_subtitles(self, url: str, language: str = "ko") -> Dict[str, Any]:
        """
        지정된 URL과 언어로 YouTube 자막을 가져옵니다.
        """
        # 비디오 ID 추출
        video_id = self.extract_video_id(url)
        if not video_id:
            logger.error(f"유효하지 않은 YouTube URL: {url}")
            return {
                "success": False,
                "message": "유효하지 않은 YouTube URL입니다."
            }
        
        logger.info(f"자막 요청 처리 시작 - URL: {url}, 언어: {language}")
        
        # 1. yt-dlp를 사용한 자막 추출 방식
        success, result = await self.get_subtitles_with_ytdlp(video_id, language)
        if success:
            return result
            
        # 2. 실패한 경우 파일 기반 방식으로 시도
        logger.info("yt-dlp API 방식 실패, 파일 기반 방식 시도 중...")
        success, result = await self.get_subtitles_with_file(video_id, language)
        
        if not success:
            logger.error(f"모든 자막 추출 방식 실패: {video_id}")
            return {
                "success": False,
                "message": f"Could not find captions for video: {video_id}"
            }
            
        return result
    
    async def get_subtitles_with_ytdlp(self, video_id: str, language: str) -> Tuple[bool, Dict[str, Any]]:
        """
        yt-dlp API를 사용하여 자막을 추출합니다.
        """
        logger.info(f"yt-dlp API 방식으로 자막 추출 시도 - 비디오 ID: {video_id}, 언어: {language}")
        
        try:
            # 비동기 함수를 호출
            success, result = await get_subtitles(video_id, language)
            
            if success:
                # 비디오 정보에 videoId 추가
                if 'data' in result and 'videoInfo' in result['data']:
                    result['data']['videoInfo']['videoId'] = video_id
                    
                # subtitles 필드 추가 (Node.js API와 호환성을 위해)
                if 'data' in result:
                    if 'subtitles' not in result['data']:
                        result['data']['subtitles'] = []
                    
                logger.info(f"yt-dlp API 방식으로 자막 추출 성공: {video_id}")
            else:
                logger.warning(f"yt-dlp API 방식으로 자막 추출 실패: {video_id}")
                
            return success, result
        except Exception as e:
            logger.error(f"yt-dlp API 사용 중 예외 발생: {str(e)}")
            return False, {
                "success": False, 
                "message": f"Error during subtitle extraction: {str(e)}"
            }
    
    async def get_subtitles_with_file(self, video_id: str, language: str) -> Tuple[bool, Dict[str, Any]]:
        """
        파일 기반 방식으로 자막 추출을 시도합니다.
        마지막 대안으로 사용됩니다.
        """
        try:
            self.logger.info(f"파일 기반 자막 추출 시도 - 비디오 ID: {video_id}, 언어: {language}")
            
            # 비디오 정보 가져오기
            video_info = self.get_video_info(video_id)
            if not video_info:
                return False, {'message': 'Failed to get video info'}
            
            # 자막 파일 경로
            subtitle_file = f"{video_id}_{language}.txt"
            
            # 자막 파일 존재 여부 확인
            if os.path.exists(subtitle_file):
                self.logger.info(f"기존 자막 파일 사용: {subtitle_file}")
                with open(subtitle_file, 'r', encoding='utf-8') as f:
                    subtitle_text = f.read()
                
                # 응답 데이터 구성
                result = {
                    'text': subtitle_text,
                    'subtitles': [],  # Node.js 백엔드와 호환성을 위해 빈 배열 포함
                    'videoInfo': {
                        'title': video_info.get('title', f"Video {video_id}"),
                        'channelName': video_info.get('channelName', 'Unknown Channel'),
                        'thumbnailUrl': video_info.get('thumbnailUrl', f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                        'videoId': video_id  # 비디오 ID 포함
                    }
                }
                return True, result
            else:
                self.logger.warning(f"자막 파일을 찾을 수 없음: {subtitle_file}")
                return False, {'message': f"Subtitle file not found for video: {video_id}"}
                
        except Exception as e:
            self.logger.error(f"파일 기반 자막 추출 오류: {str(e)}")
            return False, {'message': str(e)}
    
    def parse_subtitle_file(self, file_path: str, content: str) -> str:
        """
        자막 파일의 내용을 파싱하여 텍스트만 추출합니다.
        """
        if file_path.endswith('.vtt'):
            return self.parse_vtt_subtitles(content)
        elif file_path.endswith('.srt'):
            return self.parse_srt_subtitles(content)
        else:
            logger.warning(f"지원하지 않는 자막 파일 형식: {file_path}")
            return content
    
    def parse_vtt_subtitles(self, content: str) -> str:
        """
        WebVTT 형식 자막을 파싱합니다.
        """
        lines = content.split('\n')
        text_lines = []
        
        # WebVTT 헤더 건너뛰기
        start_parsing = False
        
        for line in lines:
            # 타임스탬프 줄 확인
            if '-->' in line:
                start_parsing = True
                continue
            
            # 빈 줄이나 타임스탬프 줄 건너뛰기
            if not line.strip() or not start_parsing:
                continue
                
            # NOTE, STYLE 등의 태그 건너뛰기
            if line.strip().startswith('<'):
                continue
                
            # 텍스트 줄 추가
            text_lines.append(line.strip())
        
        return '\n'.join(text_lines)
    
    def parse_srt_subtitles(self, content: str) -> str:
        """
        SRT 형식 자막을 파싱합니다.
        """
        lines = content.split('\n')
        text_lines = []
        
        for i, line in enumerate(lines):
            # 숫자나 타임스탬프 줄 건너뛰기
            if line.strip().isdigit() or '-->' in line:
                continue
                
            # 빈 줄 건너뛰기
            if not line.strip():
                continue
                
            # 텍스트 줄 추가
            text_lines.append(line.strip())
        
        return '\n'.join(text_lines)

    def extract_video_id(self, url: str) -> Optional[str]:
        """
        YouTube URL에서 비디오 ID를 추출합니다.
        다양한 YouTube URL 형식을 지원합니다.
        
        지원하는 형식:
        - https://www.youtube.com/watch?v=VIDEO_ID
        - https://youtu.be/VIDEO_ID
        - https://www.youtube.com/embed/VIDEO_ID
        - https://m.youtube.com/watch?v=VIDEO_ID
        """
        try:
            # URL 파싱
            parsed_url = urllib.parse.urlparse(url)
            
            # youtu.be 형식
            if parsed_url.netloc == 'youtu.be':
                return parsed_url.path.lstrip('/')
            
            # youtube.com 형식
            if 'youtube.com' in parsed_url.netloc or 'youtube-nocookie.com' in parsed_url.netloc:
                if '/embed/' in parsed_url.path:
                    return parsed_url.path.split('/embed/')[1].split('/')[0].split('?')[0]
                
                if '/watch' in parsed_url.path:
                    query = urllib.parse.parse_qs(parsed_url.query)
                    if 'v' in query:
                        return query['v'][0]
            
            self.logger.warning(f"지원되지 않는 YouTube URL 형식: {url}")
            return None
            
        except Exception as e:
            self.logger.error(f"URL에서 비디오 ID 추출 중 오류: {str(e)}")
            return None 
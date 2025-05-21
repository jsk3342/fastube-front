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

from ..utils.youtube_utils import (
    extract_video_id,
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
    
    async def get_video_info(self, video_id: str) -> Dict[str, Any]:
        """
        비디오 정보를 가져옵니다.
        """
        logger.info(f"비디오 정보 요청: {video_id}")
        return get_video_info(video_id)
    
    async def get_subtitles(self, url: str, language: str = "ko") -> Dict[str, Any]:
        """
        지정된 URL과 언어로 YouTube 자막을 가져옵니다.
        """
        # 비디오 ID 추출
        video_id = extract_video_id(url)
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
        success, result = get_subtitles(video_id, language)
        
        if success:
            # 비디오 정보에 videoId 추가
            if 'data' in result and 'videoInfo' in result['data']:
                result['data']['videoInfo']['videoId'] = video_id
                
            # subtitles 필드 추가 (호환성을 위해)
            if 'data' in result:
                result['data']['subtitles'] = []
                
            logger.info(f"yt-dlp API 방식으로 자막 추출 성공: {video_id}")
        else:
            logger.warning(f"yt-dlp API 방식으로 자막 추출 실패: {video_id}")
            
        return success, result
    
    async def get_subtitles_with_file(self, video_id: str, language: str) -> Tuple[bool, Dict[str, Any]]:
        """
        파일 기반 방식으로 자막을 추출합니다.
        임시 파일에 자막을 저장하고 이를 읽어 처리합니다.
        """
        logger.info(f"파일 기반 방식으로 자막 추출 시도 - 비디오 ID: {video_id}, 언어: {language}")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # 자막 파일명 설정
                subtitle_filename = os.path.join(temp_dir, f"{video_id}.{language}")
                
                # yt-dlp 명령 실행
                cmd = [
                    'yt-dlp',
                    '--skip-download',
                    '--write-sub',
                    '--write-auto-sub',
                    f'--sub-lang={language},en',
                    f'--output={subtitle_filename}',
                    f'https://www.youtube.com/watch?v={video_id}'
                ]
                
                logger.info(f"yt-dlp 명령 실행: {' '.join(cmd)}")
                process = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    check=False
                )
                
                if process.returncode != 0:
                    logger.error(f"yt-dlp 명령 실패: {process.stderr}")
                    return False, {"success": False, "message": "자막 추출 중 오류가 발생했습니다."}
                
                # 생성된 자막 파일 찾기
                subtitle_files = [
                    f for f in os.listdir(temp_dir) 
                    if f.startswith(os.path.basename(subtitle_filename)) and 
                    (f.endswith('.vtt') or f.endswith('.srt'))
                ]
                
                if not subtitle_files:
                    logger.error(f"자막 파일을 찾을 수 없음: {temp_dir}")
                    return False, {"success": False, "message": "자막 파일을 찾을 수 없습니다."}
                
                # 첫 번째 자막 파일 사용
                subtitle_file = os.path.join(temp_dir, subtitle_files[0])
                logger.info(f"자막 파일 발견: {subtitle_file}")
                
                # 자막 파일 읽기
                with open(subtitle_file, 'r', encoding='utf-8') as f:
                    subtitle_content = f.read()
                
                # 자막 내용 파싱 (파일 형식에 따라 다르게 처리 필요)
                subtitle_text = self.parse_subtitle_file(subtitle_file, subtitle_content)
                
                if not subtitle_text:
                    logger.error("자막 내용을 파싱할 수 없습니다.")
                    return False, {"success": False, "message": "자막 내용을 파싱할 수 없습니다."}
                
                # 비디오 정보 가져오기
                video_info = await self.get_video_info(video_id)
                
                logger.info(f"파일 기반 방식으로 자막 추출 성공: {video_id}")
                return True, {
                    "success": True,
                    "data": {
                        "text": subtitle_text,
                        "subtitles": [],  # 호환성을 위해 빈 배열 추가
                        "videoInfo": {
                            "title": video_info.get("title", ""),
                            "channelName": video_info.get("channelName", ""),
                            "thumbnailUrl": video_info.get("thumbnailUrl", ""),
                            "videoId": video_id
                        }
                    }
                }
                
            except Exception as e:
                logger.exception(f"파일 기반 자막 추출 중 오류: {str(e)}")
                return False, {"success": False, "message": str(e)}
    
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
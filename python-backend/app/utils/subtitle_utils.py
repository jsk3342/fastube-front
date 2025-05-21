"""
자막 처리 유틸리티 함수
"""
import re
import html
from typing import List, Dict, Any, TypedDict, Optional

class SubtitleItem(TypedDict):
    """자막 항목 데이터 타입"""
    text: str
    start: str  # 시작 시간 (초)
    dur: str  # 지속 시간 (초)
    duration: Optional[str]  # Node.js 백엔드와 호환성을 위한 필드 (dur과 동일한 값)
    startFormatted: Optional[str]  # "00:00" 형식
    end: Optional[float]  # 종료 시간 (초)

def format_time(seconds: float) -> str:
    """
    초 단위를 "00:00" 형식으로 변환합니다.
    
    Args:
        seconds: 변환할 초 단위 시간
        
    Returns:
        "00:00" 형식의 시간 문자열
    """
    # 정수로 변환하여 소수점 제거 (안전하게 먼저 float으로 변환 후 int로 변환)
    try:
        total_seconds = int(float(seconds))
        mins = total_seconds // 60
        secs = total_seconds % 60
        return f"{mins:02d}:{secs:02d}"
    except (ValueError, TypeError):
        # 변환 오류 시 기본값 반환
        return "00:00"

def decode_html_entities(text: str) -> str:
    """
    HTML 엔티티가 포함된 텍스트를 디코딩합니다.
    
    Args:
        text: 디코딩할 텍스트
        
    Returns:
        디코딩된 텍스트
    """
    try:
        return html.unescape(text)
    except Exception:
        return text

def enhance_subtitle_items(subtitles: List[SubtitleItem]) -> List[SubtitleItem]:
    """
    SubtitleItem 배열에 추가 정보를 계산하여 확장된 배열을 반환합니다.
    
    Args:
        subtitles: 원본 자막 항목 리스트
        
    Returns:
        확장된 자막 항목 리스트
    """
    result = []
    
    for item in subtitles:
        start = float(item["start"])
        dur = float(item["dur"])
        
        # 텍스트 디코딩 및 추가 정보 계산
        enhanced_item = {
            **item,
            "text": decode_html_entities(item["text"]),
            "end": start + dur,
            "duration": item["dur"]  # duration 필드 추가 (dur과 같은 값)
        }
        
        # startFormatted가 없을 경우에만 추가
        if "startFormatted" not in item:
            enhanced_item["startFormatted"] = format_time(start)
        
        result.append(enhanced_item)
    
    return result

def extract_subtitle_items_from_xml(xml_content: str) -> List[SubtitleItem]:
    """
    XML 형식의 자막 내용에서 SubtitleItem 목록을 추출합니다.
    
    Args:
        xml_content: XML 형식의 자막 내용
        
    Returns:
        SubtitleItem 목록
    """
    # XML에서 자막 추출 (<text start="시작시간" dur="지속시간">텍스트</text>)
    subtitle_items = []
    
    # XML 태그 제거하고 자막 텍스트 파싱
    content = xml_content.replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', "")
    content = content.replace("</transcript>", "")
    
    # 각 자막 항목 파싱
    for line in content.split("</text>"):
        line = line.strip()
        if not line:
            continue
        
        # 시작 시간과 지속 시간 추출
        start_match = re.search(r'start="([\d.]+)"', line)
        dur_match = re.search(r'dur="([\d.]+)"', line)
        
        if start_match and dur_match:
            start = start_match.group(1)
            dur = dur_match.group(1)
            
            # 시간을 "00:00" 형식으로 포맷팅
            start_formatted = format_time(float(start))
            
            # 텍스트 추출 및 태그 제거
            text = re.sub(r'<text[^>]*>', '', line)
            text = re.sub(r'<[^>]+>', '', text)  # 나머지 HTML 태그 제거
            
            subtitle_items.append({
                "start": start,
                "dur": dur,
                "duration": dur,  # duration 필드 추가
                "startFormatted": start_formatted,  # startFormatted 필드 추가
                "text": text
            })
    
    return subtitle_items

def extract_subtitle_items_from_json(json_data: Dict[str, Any]) -> List[SubtitleItem]:
    """
    JSON 형식의 자막 데이터에서 SubtitleItem 목록을 추출합니다.
    
    Args:
        json_data: JSON 형식의 자막 데이터
        
    Returns:
        SubtitleItem 목록
    """
    subtitle_items = []
    
    # JSON 자막 형식 파싱 (주로 events 배열에 자막 데이터가 있음)
    if "events" in json_data:
        for event in json_data["events"]:
            # 시작 시간
            start = str(event.get("tStartMs", 0) / 1000)
            
            # 지속 시간 (없으면 2초 기본값)
            dur = str((event.get("dDurationMs", 2000)) / 1000)
            
            # 시간을 "00:00" 형식으로 포맷팅
            start_formatted = format_time(float(start))
            
            # 텍스트 추출 (세그먼트 결합)
            text = ""
            if "segs" in event:
                for seg in event["segs"]:
                    if "utf8" in seg:
                        text += seg["utf8"]
            
            if text.strip():
                subtitle_items.append({
                    "start": start,
                    "dur": dur,
                    "duration": dur,  # duration 필드 추가
                    "startFormatted": start_formatted,  # startFormatted 필드 추가
                    "text": text.strip()
                })
    
    return subtitle_items

def convert_transcript_api_format(transcript_data: List[Dict[str, Any]]) -> List[SubtitleItem]:
    """
    YouTube Transcript API 형식의 자막 데이터를 SubtitleItem 형식으로 변환합니다.
    프론트엔드에서 요구하는 필드를 모두 포함합니다.
    
    Args:
        transcript_data: YouTube Transcript API에서 반환된 자막 데이터
        
    Returns:
        SubtitleItem 목록 (프론트엔드 호환)
    """
    subtitle_items = []
    
    for item in transcript_data:
        # 시작 시간과 지속 시간 추출
        start = item.get("start", 0)
        dur = item.get("duration", 2)  # 기본 지속 시간 2초
        
        # 시간을 "00:00" 형식으로 포맷팅 (항상 수행)
        start_formatted = format_time(start)
        
        # 텍스트 내 HTML 엔티티 디코딩
        text = decode_html_entities(item.get("text", ""))
        
        # SubtitleItem 생성 (프론트엔드와 동일한 형식)
        subtitle_item = {
            "text": text,
            "start": str(start),
            "dur": str(dur),
            "duration": str(dur),  # duration 필드 추가 (dur과 동일한 값)
            "startFormatted": start_formatted,  # startFormatted 필드 필수 추가
            "end": start + dur  # 종료 시간 계산하여 추가
        }
        
        subtitle_items.append(subtitle_item)
    
    return subtitle_items

def process_subtitles(subtitle_text: str, format_type: str = "text") -> Dict[str, Any]:
    """
    자막 텍스트를 처리하여 SubtitleItem 목록과 전체 텍스트를 반환합니다.
    
    Args:
        subtitle_text: 자막 텍스트 또는 JSON/XML 문자열
        format_type: 자막 형식 ("text", "xml", "json")
        
    Returns:
        처리된 자막 데이터 (subtitles 및 text 포함)
    """
    # 기본 응답 구조
    result = {
        "text": subtitle_text,
        "subtitles": []
    }
    
    try:
        # 형식에 따라 처리
        if format_type == "xml" or (format_type == "text" and subtitle_text.startswith("<?xml")):
            # XML 형식 처리
            subtitle_items = extract_subtitle_items_from_xml(subtitle_text)
            result["subtitles"] = enhance_subtitle_items(subtitle_items)
            
        elif format_type == "json" or (format_type == "text" and subtitle_text.startswith("{")):
            # JSON 형식 처리
            import json
            try:
                json_data = json.loads(subtitle_text)
                subtitle_items = extract_subtitle_items_from_json(json_data)
                result["subtitles"] = enhance_subtitle_items(subtitle_items)
            except json.JSONDecodeError:
                # 일반 텍스트로 처리
                pass
                
        else:
            # 일반 텍스트 형식 (줄 단위)
            lines = subtitle_text.strip().split('\n')
            subtitle_items = []
            
            # 각 줄을 자막 항목으로 처리 (시간 정보 없음)
            for i, line in enumerate(lines):
                line = line.strip()
                if not line:
                    continue
                
                # 기본 시작 시간: 각 줄마다 3초씩 증가
                start = i * 3
                dur = "3"  # 기본 지속 시간 3초
                
                # 시간을 "00:00" 형식으로 포맷팅
                start_formatted = format_time(float(start))
                
                subtitle_items.append({
                    "start": str(start),
                    "dur": dur,
                    "duration": dur,  # duration 필드 추가
                    "startFormatted": start_formatted,  # startFormatted 필드 추가
                    "text": line
                })
            
            result["subtitles"] = subtitle_items  # 이미 형식이 맞으므로 enhance_subtitle_items 호출 불필요
    
    except Exception as e:
        # 오류 발생 시 기본 텍스트 반환
        import logging
        logging.getLogger("subtitle_utils").error(f"자막 처리 중 오류 발생: {str(e)}")
    
    return result 
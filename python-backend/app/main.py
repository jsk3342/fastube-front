"""
YouTube 자막 추출 API 서버 메인 모듈
"""
import logging
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, Body, Query, Path, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl

from .services.subtitle_service import SubtitleService

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("fastube-api")

# API 상세 예제
examples = {
    "subtitle_example": {
        "summary": "자막 추출 예제",
        "description": "Rick Astley의 'Never Gonna Give You Up' 뮤직비디오 한국어 자막 추출",
        "value": {
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "language": "ko"
        }
    }
}

# FastAPI 앱 생성 (상세 메타데이터 추가)
app = FastAPI(
    title="Fastube API",
    description="""
    ## YouTube 자막 추출 서비스 API
    
    이 API는 YouTube 비디오에서 자막을 추출하고 비디오 정보를 가져옵니다.
    
    ### 주요 기능:
    
    * **자막 추출**: 다양한 언어로 YouTube 자막 추출
    * **비디오 정보**: 제목, 채널명, 썸네일 등 비디오 정보 제공
    * **다국어 지원**: 한국어, 영어 등 다양한 자막 언어 지원
    
    > **참고**: 자막이 없는 경우 자동 생성 자막도 시도합니다.
    """,
    version="1.0.0",
    terms_of_service="https://fastapi.tiangolo.com/",
    contact={
        "name": "Fastube Support",
        "url": "https://github.com/yourusername/fastube",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {
            "name": "자막",
            "description": "YouTube 자막 추출 관련 API",
            "externalDocs": {
                "description": "YouTube API 정보",
                "url": "https://developers.google.com/youtube/v3/docs"
            },
        },
        {
            "name": "비디오 정보",
            "description": "YouTube 비디오의 메타데이터 관련 API",
        },
        {
            "name": "상태 확인",
            "description": "API 서버 상태 확인용 엔드포인트",
        },
    ],
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 도메인 허용 (프로덕션에서는 특정 도메인으로 제한해야 함)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 서비스 인스턴스 생성
subtitle_service = SubtitleService()

# 비디오 정보 모델
class VideoInfo(BaseModel):
    title: str = Field("", description="비디오 제목")
    channelName: str = Field("", description="채널 이름")
    thumbnailUrl: str = Field("", description="썸네일 이미지 URL")
    videoId: str = Field("", description="YouTube 비디오 ID")
    
    class Config:
        schema_extra = {
            "example": {
                "title": "Never Gonna Give You Up",
                "channelName": "Rick Astley",
                "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                "videoId": "dQw4w9WgXcQ"
            }
        }

# 자막 항목 모델
class SubtitleItem(BaseModel):
    text: str = Field(..., description="자막 텍스트")
    start: float = Field(..., description="시작 시간(초)")
    duration: float = Field(..., description="지속 시간(초)")
    
    class Config:
        schema_extra = {
            "example": {
                "text": "안녕하세요",
                "start": 10.5,
                "duration": 2.5
            }
        }

# 언어 정보 모델
class LanguageInfo(BaseModel):
    code: str = Field(..., description="언어 코드 (ISO 639-1)")
    name: str = Field(..., description="언어 이름")
    
    class Config:
        schema_extra = {
            "example": {
                "code": "ko",
                "name": "한국어"
            }
        }

# 요청 모델
class SubtitleRequest(BaseModel):
    url: str = Field(
        ..., 
        description="YouTube 동영상 URL",
        examples=[
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ"
        ]
    )
    language: str = Field(
        "ko", 
        description="자막 언어 코드 (ISO 639-1)",
        examples=["ko", "en", "ja", "zh"]
    )
    
    class Config:
        schema_extra = {
            "example": {
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "language": "ko" 
            }
        }

# 자막 데이터 모델
class SubtitleData(BaseModel):
    text: str = Field(..., description="전체 자막 텍스트")
    subtitles: List[SubtitleItem] = Field([], description="자막 항목 목록 (사용되지 않을 수 있음)")
    videoInfo: VideoInfo = Field(..., description="비디오 정보")

# 응답 모델
class SubtitleResponse(BaseModel):
    success: bool = Field(..., description="요청 성공 여부")
    data: Optional[SubtitleData] = Field(None, description="자막 데이터 (성공 시)")
    message: Optional[str] = Field(None, description="오류 메시지 (실패 시)")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "data": {
                    "text": "안녕하세요.\n이 비디오는 리릭 애슐리의 'Never Gonna Give You Up'입니다.\n...",
                    "subtitles": [],
                    "videoInfo": {
                        "title": "Never Gonna Give You Up",
                        "channelName": "Rick Astley",
                        "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                        "videoId": "dQw4w9WgXcQ"
                    }
                }
            }
        }

# 비디오 정보 응답 모델
class VideoInfoResponse(BaseModel):
    success: bool = Field(..., description="요청 성공 여부")
    data: Optional[Dict[str, Any]] = Field(None, description="비디오 정보 데이터 (성공 시)")
    message: Optional[str] = Field(None, description="오류 메시지 (실패 시)")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "data": {
                    "title": "Never Gonna Give You Up",
                    "channelName": "Rick Astley",
                    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                    "duration": 212,
                    "availableLanguages": [
                        {"code": "ko", "name": "한국어"},
                        {"code": "en", "name": "영어"}
                    ],
                    "videoId": "dQw4w9WgXcQ"
                }
            }
        }

# 오류 응답 모델
class ErrorResponse(BaseModel):
    success: bool = Field(False, description="요청 실패")
    message: str = Field(..., description="오류 메시지")
    
    class Config:
        schema_extra = {
            "example": {
                "success": False,
                "message": "Could not find captions for video: dQw4w9WgXcQ"
            }
        }

@app.get(
    "/", 
    tags=["상태 확인"],
    summary="API 서버 상태 확인",
    description="API 서버의 온라인 상태와 기본 정보를 제공합니다.",
    response_description="서버 상태 정보"
)
async def root():
    """
    API 서버 상태 확인
    
    이 엔드포인트는 API 서버가 정상적으로 작동하는지 확인합니다.
    """
    return {
        "status": "online", 
        "message": "Fastube API 서버가 실행 중입니다.",
        "version": "1.0.0",
        "documentation": "/docs"
    }

@app.post(
    "/api/subtitles", 
    tags=["자막"], 
    response_model=SubtitleResponse,
    responses={
        200: {
            "description": "자막 추출 성공",
            "model": SubtitleResponse
        },
        400: {
            "description": "잘못된 요청 (유효하지 않은 URL 등)",
            "model": ErrorResponse
        },
        404: {
            "description": "자막을 찾을 수 없음",
            "model": ErrorResponse
        },
        500: {
            "description": "서버 오류",
            "model": ErrorResponse
        }
    },
    summary="YouTube 자막 추출",
    description="""
    YouTube 동영상 URL을 받아 해당 언어의 자막을 추출합니다.
    
    지원되는 URL 형식:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    
    지원되는 언어는 ISO 639-1 언어 코드를 사용합니다. (ko: 한국어, en: 영어, ja: 일본어 등)
    """
)
async def get_subtitles(
    request: SubtitleRequest = Body(..., examples=examples)
):
    """
    YouTube 동영상의 자막을 추출합니다.
    
    - **url**: YouTube 동영상 URL
    - **language**: 자막 언어 코드 (기본값: ko)
    
    반환값은 자막 텍스트와 비디오 정보를 포함합니다.
    """
    logger.info(f"자막 요청 접수: {request.url}, 언어: {request.language}")
    
    try:
        result = await subtitle_service.get_subtitles(request.url, request.language)
        return result
    except Exception as e:
        logger.error(f"자막 추출 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get(
    "/api/video/info", 
    tags=["비디오 정보"],
    response_model=VideoInfoResponse,
    responses={
        200: {
            "description": "비디오 정보 가져오기 성공",
            "model": VideoInfoResponse
        },
        400: {
            "description": "잘못된 요청 (유효하지 않은 비디오 ID 등)",
            "model": ErrorResponse
        },
        404: {
            "description": "비디오를 찾을 수 없음",
            "model": ErrorResponse
        },
        500: {
            "description": "서버 오류",
            "model": ErrorResponse
        }
    },
    summary="YouTube 비디오 정보 조회",
    description="YouTube 비디오 ID를 받아 해당 비디오의 상세 정보를 제공합니다."
)
async def get_video_info(
    id: str = Query(
        ..., 
        description="YouTube 비디오 ID",
        example="dQw4w9WgXcQ",
        min_length=11,
        max_length=11
    )
):
    """
    YouTube 동영상의 정보를 가져옵니다.
    
    - **id**: YouTube 비디오 ID
    
    반환값은 제목, 채널명, 썸네일 URL, 지속 시간, 사용 가능한 자막 언어 등을 포함합니다.
    """
    logger.info(f"비디오 정보 요청: {id}")
    
    try:
        video_info = await subtitle_service.get_video_info(id)
        
        return {
            "success": True,
            "data": video_info
        }
    except Exception as e:
        logger.error(f"비디오 정보 가져오기 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=4000, reload=True) 
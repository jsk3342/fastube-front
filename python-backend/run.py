"""
YouTube 자막 추출 API 서버 실행 스크립트
"""
import os
import uvicorn

if __name__ == "__main__":
    # 환경 변수에서 PORT 값을 가져오거나 기본값 4000 사용
    port = int(os.environ.get("PORT", 4000))
    
    # FastAPI 앱 실행
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True) 
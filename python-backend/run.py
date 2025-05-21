"""
YouTube 자막 추출 API 서버 실행 스크립트
"""
import uvicorn

if __name__ == "__main__":
    # FastAPI 앱 실행
    uvicorn.run("app.main:app", host="0.0.0.0", port=4000, reload=True) 
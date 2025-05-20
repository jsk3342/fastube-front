import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubtitles, extractVideoID } from "@/apis/queries/useSubtitles";
import { useAppStore } from "@/store/useAppStore";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import type { SubtitleRequest, SubtitleResponse } from "@/types";

const UrlForm = () => {
  // Zustand 스토어에서 필요한 상태와 메소드만 가져오기
  const {
    // 상태 관리 메소드
    resetState,
    // 자막 관련 업데이트
    setSubtitleText,
    setSubtitleItems,
    // 비디오 정보 업데이트
    setVideoId,
    setVideoInfo,
    // 언어 관련
    language: globalLanguage,
    setLanguage: setGlobalLanguage,
  } = useAppStore();

  // 로컬 상태
  const [url, setUrl] = useState<string>("");
  const [language, setLanguage] = useState<string>(globalLanguage);

  // YouTube URL 유효성 검사
  const isValidYoutubeUrl = (url: string): boolean => !!extractVideoID(url);

  // 언어 변경 핸들러
  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    setGlobalLanguage(value);
  };

  // React Query 훅 사용
  const { mutate, isPending, isError } = useSubtitles({
    onSuccess: (result: SubtitleResponse) => {
      if (!result.success) {
        toast.error("자막을 가져오는데 실패했습니다");
        return;
      }

      const { videoInfo, fullText, subtitles } = result.data;

      // 비디오 정보 업데이트
      setVideoId(videoInfo.videoId);
      setVideoInfo({
        title: videoInfo.title || "YouTube 비디오",
        channelName: videoInfo.channelName || "채널 이름",
        thumbnailUrl:
          videoInfo.thumbnailUrl ||
          `https://img.youtube.com/vi/${videoInfo.videoId}/maxresdefault.jpg`,
        videoId: videoInfo.videoId,
      });

      // 자막 정보 업데이트
      setSubtitleText(fullText);
      setSubtitleItems(subtitles);

      // 성공 메시지
      toast.success("자막을 성공적으로 가져왔습니다!");
    },

    onError: (error: Error, variables: SubtitleRequest) => {
      console.error("자막 요청 오류:", error);

      // 해당 언어의 자막을 찾을 수 없는 경우 영어 자막으로 자동 시도
      if (variables.language !== "en") {
        toast.info("해당 언어의 자막을 찾을 수 없어 영어 자막으로 시도합니다.");

        // 전역 및 로컬 언어 상태 변경
        setGlobalLanguage("en");
        setLanguage("en");

        // 영어로 자동 재시도
        mutate({
          url: variables.url,
          language: "en",
        });
      } else {
        toast.error("자막 추출 중 오류가 발생했습니다");
      }
    },
  });

  // 폼 제출 핸들러
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidYoutubeUrl(url)) {
      toast.error("유효한 YouTube URL을 입력해주세요");
      return;
    }

    // 이전 상태 초기화
    resetState();

    // 자막 요청 실행
    mutate({ url, language });
  };

  return (
    <Card className="p-6 w-full max-w-4xl mx-auto mb-6 bg-card">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-xl font-bold text-center mb-4">
          YouTube 자막 추출기
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <Input
            type="text"
            placeholder="YouTube URL을 입력하세요"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
            disabled={isPending}
          />

          <Select
            value={language}
            onValueChange={handleLanguageChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="언어 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">영어</SelectItem>
              <SelectItem value="ja">일본어</SelectItem>
              <SelectItem value="zh">중국어</SelectItem>
              <SelectItem value="es">스페인어</SelectItem>
              <SelectItem value="fr">프랑스어</SelectItem>
            </SelectContent>
          </Select>

          <Button type="submit" disabled={isPending || !url}>
            {isPending ? <Spinner className="mr-2" /> : null}
            {isPending ? "처리 중..." : "자막 추출"}
          </Button>
        </div>

        {isError && !isPending && (
          <div className="text-destructive text-sm mt-2">
            자막을 가져오는데 실패했습니다. URL을 확인하거나 다시 시도해 주세요.
          </div>
        )}
      </form>
    </Card>
  );
};

export default UrlForm;

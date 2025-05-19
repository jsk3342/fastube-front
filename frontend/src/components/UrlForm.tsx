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

const UrlForm = () => {
  const {
    setSubtitleText,
    setVideoInfo,
    setSubtitleItems,
    setVideoId,
    resetState,
  } = useAppStore();
  const [url, setUrl] = useState<string>("");
  const [language, setLanguage] = useState<string>("ko");
  const subtitlesMutation = useSubtitles();

  const validateYoutubeUrl = (url: string): boolean => {
    return !!extractVideoID(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateYoutubeUrl(url)) {
      toast.error("유효한 YouTube URL을 입력해주세요");
      return;
    }

    // 이전 상태 초기화
    resetState();

    try {
      const result = await subtitlesMutation.mutateAsync({
        url,
        language,
      });

      if (result.success) {
        // API 호출 성공 시 즉시 전역 상태 업데이트
        const data = result.data;

        // 비디오 정보 먼저 업데이트 - 의존성 관계를 고려
        setVideoId(data.videoInfo.videoId);
        setVideoInfo({
          title: data.videoInfo.title || "YouTube 비디오",
          channelName: data.videoInfo.channelName || "채널 이름",
          thumbnailUrl:
            data.videoInfo.thumbnailUrl ||
            `https://img.youtube.com/vi/${data.videoInfo.videoId}/maxresdefault.jpg`,
          videoId: data.videoInfo.videoId,
        });

        // 자막 정보 업데이트
        setSubtitleText(data.fullText);
        setSubtitleItems(data.subtitles);

        // 성공 메시지
        toast.success("자막을 성공적으로 가져왔습니다!");

        // 디버깅용 로그
        console.log("상태 업데이트 완료:", {
          videoId: data.videoInfo.videoId,
          subtitleText: data.fullText.substring(0, 50) + "...",
          subtitleItems: data.subtitles.length,
        });
      } else {
        toast.error("자막을 가져오는데 실패했습니다");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("자막 추출 중 오류가 발생했습니다");
    }
  };

  const isLoading = subtitlesMutation.isPending;
  const isError = subtitlesMutation.isError;

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
            disabled={isLoading}
          />

          <Select
            value={language}
            onValueChange={setLanguage}
            disabled={isLoading}
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

          <Button type="submit" disabled={isLoading || !url}>
            {isLoading ? <Spinner className="mr-2" /> : null}
            {isLoading ? "처리 중..." : "자막 추출"}
          </Button>
        </div>

        {isError && (
          <div className="text-destructive text-sm mt-2">
            자막을 가져오는데 실패했습니다. URL을 확인하거나 다시 시도해 주세요.
          </div>
        )}
      </form>
    </Card>
  );
};

export default UrlForm;

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Copy, Download, List, AlignJustify, Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { SubtitleItem } from "@/types";

// 자막 검색 결과 강조 처리를 위한 컴포넌트
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) return <>{text}</>;

  try {
    // 단순화된 접근법: 직접 문자열로 분할 후 하이라이팅
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    if (!normalizedText.includes(normalizedQuery)) {
      return <>{text}</>; // 검색어가 없으면 원본 텍스트 반환
    }

    const fragments = [];
    let lastIndex = 0;
    let index = normalizedText.indexOf(normalizedQuery);

    while (index !== -1) {
      // 검색어 앞 부분 추가
      if (index > lastIndex) {
        fragments.push(text.substring(lastIndex, index));
      }

      // 검색어 부분 하이라이팅하여 추가
      fragments.push(
        <mark
          key={`mark-${index}`}
          className="bg-yellow-300 dark:bg-yellow-800 text-black dark:text-white px-0.5 rounded"
        >
          {text.substring(index, index + query.length)}
        </mark>
      );

      lastIndex = index + query.length;
      index = normalizedText.indexOf(normalizedQuery, lastIndex);
    }

    // 마지막 검색어 이후 부분 추가
    if (lastIndex < text.length) {
      fragments.push(text.substring(lastIndex));
    }

    return <>{fragments}</>;
  } catch (error) {
    console.error("하이라이팅 오류:", error);
    return <>{text}</>;
  }
};

// 타임라인 뷰 컴포넌트
const TimelineView = ({
  subtitleItems,
  searchQuery,
  onTimestampClick,
}: {
  subtitleItems: SubtitleItem[];
  searchQuery: string;
  onTimestampClick: (startTime: number) => void;
}) => {
  // 검색어로 필터링된 자막 아이템
  const filteredSubtitles = subtitleItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    return item.text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-[300px] flex flex-col">
      {filteredSubtitles.length > 0 ? (
        // 검색 결과가 있는 경우
        <>
          <div className="flex-1">
            {filteredSubtitles.map((item, index) => (
              <div
                key={index}
                className="p-2 border rounded hover:bg-accent cursor-pointer flex mb-2"
                onClick={() => onTimestampClick(parseFloat(item.start))}
              >
                <div className="text-sm font-mono text-blue-500 min-w-[50px]">
                  {item.startFormatted}
                </div>
                <div className="ml-3">
                  <HighlightedText text={item.text} query={searchQuery} />
                </div>
              </div>
            ))}
          </div>

          {searchQuery.trim() !== "" && (
            <div className="text-right py-2 px-3 border-t mt-auto">
              <Badge variant="secondary">
                {filteredSubtitles.length}/{subtitleItems.length}건 표시됨
              </Badge>
            </div>
          )}
        </>
      ) : (
        // 검색 결과가 없는 경우
        <div className="flex flex-col items-center justify-center h-full py-20">
          <Search className="h-10 w-10 text-muted-foreground mb-4 opacity-20" />
          <p className="text-muted-foreground text-center">
            검색 결과가 없습니다
          </p>
          <p className="text-muted-foreground text-center text-sm mt-2">
            다른 검색어로 시도하거나 검색어를 지워보세요
          </p>
          {searchQuery.trim() !== "" && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() =>
                document.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "Escape" })
                )
              }
            >
              검색어 지우기
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// 텍스트 뷰 컴포넌트
const TextView = ({
  subtitleText,
  searchQuery,
  highlightedText,
  matchCount,
  textareaRef,
}: {
  subtitleText: string;
  searchQuery: string;
  highlightedText: string;
  matchCount: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) => {
  return (
    <div className="relative">
      {searchQuery.trim() !== "" && highlightedText ? (
        <div
          className="min-h-[300px] w-full p-3 border rounded-md bg-background overflow-auto whitespace-pre-wrap transition-all duration-300 ease-in-out animate-in fade-in-50 slide-in-from-top-2"
          dangerouslySetInnerHTML={{ __html: highlightedText }}
        />
      ) : (
        <Textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          value={subtitleText}
          readOnly
          className="min-h-[300px] w-full transition-all duration-300 ease-in-out"
        />
      )}
      {searchQuery.trim() !== "" && (
        <div className="absolute bottom-3 right-3">
          <Badge variant="secondary">{matchCount}건 검색됨</Badge>
        </div>
      )}
    </div>
  );
};

// 메인 자막 결과 컴포넌트
const SubtitleResult = () => {
  // Zustand store에서 필요한 상태 가져오기
  const { subtitleText, subtitleItems, videoId, videoInfo } = useAppStore();

  // videoInfo가 null인 경우 기본값 제공
  const title = videoInfo?.title || "YouTube 비디오";
  const channelName = videoInfo?.channelName || "채널 정보 없음";

  // refs
  const videoRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 로컬 상태
  const [viewMode, setViewMode] = useState<"text" | "timeline">("text");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedText, setHighlightedText] = useState("");

  // 검색 결과 카운트 계산
  const matchCount = searchQuery.trim()
    ? subtitleItems.filter((item) =>
        item.text.toLowerCase().includes(searchQuery.toLowerCase())
      ).length
    : 0;

  // 전체 텍스트에서 검색어 하이라이팅을 위한 HTML 생성 함수
  const getHighlightedFullText = (text: string, query: string): string => {
    if (!query.trim()) return "";

    try {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedQuery, "gi");

      // 검색어를 HTML mark 태그로 감싸기
      return text.replace(
        regex,
        '<mark class="bg-yellow-300 dark:bg-yellow-830 text-black dark:text-white px-0.5 rounded">$&</mark>'
      );
    } catch (error) {
      console.error("전체 텍스트 하이라이팅 오류:", error);
      return "";
    }
  };

  // YouTube 플레이어 제어 - 타임스탬프 클릭 핸들러
  const handleTimestampClick = (startTime: number) => {
    if (!videoId || !videoRef.current) return;

    // 임베디드 플레이어에서 특정 시간으로 이동
    const iframe = videoRef.current;
    const currentSrc = iframe.src;
    const baseUrl = currentSrc.split("?")[0];

    // YouTube 임베디드 플레이어 파라미터 설정
    iframe.src = `${baseUrl}?start=${Math.floor(startTime)}&autoplay=1`;
  };

  // 자막 복사 핸들러
  const handleCopySubtitle = () => {
    navigator.clipboard.writeText(subtitleText).then(
      () => toast.success("자막이 복사되었습니다!"),
      () => toast.error("자막 복사에 실패했습니다")
    );
  };

  // 자막 다운로드 핸들러
  const handleDownloadSubtitle = () => {
    // 텍스트 파일로 다운로드
    const element = document.createElement("a");
    const file = new Blob([subtitleText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `subtitle-${videoId || "youtube"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast.success("자막이 다운로드되었습니다!");
  };

  // 검색어 변경 시 로그 및 텍스트 하이라이팅 적용
  useEffect(() => {
    if (searchQuery && viewMode === "text" && subtitleText) {
      const highlighted = getHighlightedFullText(subtitleText, searchQuery);
      setHighlightedText(highlighted);
    } else {
      setHighlightedText("");
    }
  }, [searchQuery, viewMode, subtitleText]);

  // ESC 키 이벤트 리스너 추가
  useEffect(() => {
    const handleGlobalEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleGlobalEscape);

    return () => {
      document.removeEventListener("keydown", handleGlobalEscape);
    };
  }, []);

  // 자막이 없으면 컴포넌트를 렌더링하지 않음
  if (!subtitleText || subtitleText.trim() === "") {
    return null;
  }

  // 뷰 모드 변경 핸들러
  const handleViewModeChange = (value: string) => {
    if (value) {
      setViewMode(value as "text" | "timeline");
    }
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // ESC 키 처리 핸들러
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setSearchQuery("");
  };

  return (
    <Card className="p-6 w-full max-w-4xl mx-auto bg-card">
      {/* 비디오 정보 영역 */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{channelName}</p>
      </div>

      {/* 임베디드 YouTube 플레이어 */}
      {videoId && (
        <div className="mb-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-md">
            <iframe
              ref={videoRef}
              src={`https://www.youtube.com/embed/${videoId}`}
              title={title}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            ></iframe>
          </div>
        </div>
      )}

      {/* 자막 제어 영역 */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <h3 className="text-lg font-semibold">추출된 자막</h3>

        <div className="flex flex-wrap gap-2 items-center">
          {/* 검색 입력 필드 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="자막 검색..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-8 h-9 w-[200px]"
              onKeyDown={handleKeyDown}
            />
            {searchQuery.trim() !== "" && (
              <Badge className="absolute right-2.5 top-2" variant="secondary">
                {matchCount}건
              </Badge>
            )}
          </div>

          {/* 뷰 모드 토글 */}
          <TooltipProvider delayDuration={100}>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={handleViewModeChange}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="text" aria-label="텍스트 보기">
                    <AlignJustify className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="top">
                  텍스트 보기 - 전체 자막을 텍스트로 표시합니다
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="timeline" aria-label="타임라인 보기">
                    <List className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="top">
                  타임라인 보기 - 시간별로 자막을 나열합니다
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </TooltipProvider>

          {/* 자막 액션 버튼 */}
          <Button variant="outline" size="sm" onClick={handleCopySubtitle}>
            <Copy className="mr-2 h-4 w-4" /> 복사하기
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownloadSubtitle}>
            <Download className="mr-2 h-4 w-4" /> 다운로드
          </Button>
        </div>
      </div>

      {/* 자막 내용 뷰 영역 - 전환 애니메이션 추가 */}
      <div className="transition-all duration-300 ease-in-out">
        {viewMode === "text" ? (
          <TextView
            subtitleText={subtitleText}
            searchQuery={searchQuery}
            highlightedText={highlightedText}
            matchCount={matchCount}
            textareaRef={textareaRef}
          />
        ) : (
          <div className="h-[500px] overflow-y-auto p-2 border rounded-md transition-all duration-300">
            <TimelineView
              subtitleItems={subtitleItems}
              searchQuery={searchQuery}
              onTimestampClick={handleTimestampClick}
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default SubtitleResult;

/**
 * YouTube 자막 처리 관련 유틸리티
 * 백엔드 API를 통해 자막을 가져오는 방식으로 변경되었으므로
 * 이 파일은 현재 백업용으로만 유지되고 있습니다.
 */

// HTML 엔티티를 정상 문자로 변환하는 함수
export const decodeHtmlEntities = (text: string): string => {
  // 숫자 참조 형식 HTML 엔티티(&#39; 등) 변환을 위한 임시 요소 생성
  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  let decoded = textArea.value;

  // 이름 참조 형식 엔티티(&quot; 등) 수동 변환
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&apos;": "'",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };

  decoded = decoded.replace(
    /&quot;|&apos;|&amp;|&lt;|&gt;|&nbsp;/g,
    (match) => entities[match] || match
  );

  return decoded;
};

// 초 단위를 "00:00" 형식으로 변환하는 함수
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

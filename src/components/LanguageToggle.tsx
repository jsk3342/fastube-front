import { Toggle } from "@/components/ui/toggle";
import { useAppStore } from "@/store/useAppStore";

export default function LanguageToggle() {
  const { language, setLanguage } = useAppStore();

  return (
    <div className="flex items-center gap-2">
      <Toggle
        pressed={language === "ko"}
        onPressedChange={() => setLanguage("ko")}
        variant="outline"
        className="text-sm"
        aria-label="한국어 선택"
      >
        한국어
      </Toggle>
      <Toggle
        pressed={language === "en"}
        onPressedChange={() => setLanguage("en")}
        variant="outline"
        className="text-sm"
        aria-label="영어 선택"
      >
        English
      </Toggle>
    </div>
  );
}

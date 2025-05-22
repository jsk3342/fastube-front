import React from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { Moon, Sun } from "lucide-react";

export default function Header() {
  const { isDarkMode, toggleDarkMode } = useAppStore();

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  return (
    <header className="w-full border-b py-4 bg-background/70 backdrop-blur-md shadow-sm relative z-30">
      <div className="container mx-auto flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-transparent bg-clip-text">
            FastTube
          </span>
          <span className="text-sm text-muted-foreground">
            유튜브 자막 추출 서비스
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkMode}
          aria-label={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          className="bg-background/50 backdrop-blur-sm"
        >
          {isDarkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  );
}

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// SVG 요소에 맞게 타입 변경
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

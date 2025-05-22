import { AlertCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export default function ErrorMessage() {
  const { error } = useAppStore();

  if (!error) return null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive bg-destructive/30 backdrop-blur-sm p-3 text-sm text-destructive shadow-md relative z-20">
      <AlertCircle className="h-4 w-4" />
      <span>{error}</span>
    </div>
  );
}

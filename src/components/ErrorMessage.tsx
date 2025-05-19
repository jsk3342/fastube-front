import { AlertCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export default function ErrorMessage() {
  const { error } = useAppStore();

  if (!error) return null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" />
      <span>{error}</span>
    </div>
  );
}

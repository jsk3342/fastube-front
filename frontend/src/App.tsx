import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Header from "@/components/Header";
import UrlForm from "@/components/UrlForm";
import SubtitleResult from "@/components/SubtitleResult";
import ErrorMessage from "@/components/ErrorMessage";
import { useAppStore } from "@/store/useAppStore";

// React Query 클라이언트 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// 자막 결과 섹션을 처리하는 컴포넌트
const SubtitleSection = () => {
  const { subtitleText } = useAppStore();

  if (!subtitleText) return null;

  return <SubtitleResult />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 py-8">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-8 text-center">
                <h1 className="mb-2 text-3xl font-bold">FastTube</h1>
                <p className="text-muted-foreground">
                  유튜브 영상의 자막/스크립트를 추출하는 웹 애플리케이션입니다.
                </p>
              </div>

              <UrlForm />
              <ErrorMessage />
              <SubtitleSection />
            </div>
          </div>
        </main>
        <footer className="border-t py-4">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} FastTube. 모든 권리 보유.
          </div>
        </footer>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;

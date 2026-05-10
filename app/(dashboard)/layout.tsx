import Sidebar from "@/components/layout/Sidebar";

/**
 * ダッシュボード共通レイアウト
 * 全保護ページはこのレイアウトを継承する
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* サイドバー（デスクトップ常時表示） */}
      <Sidebar />

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}

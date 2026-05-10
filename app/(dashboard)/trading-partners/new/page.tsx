import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import TradingPartnerForm from "../TradingPartnerForm";

export const metadata: Metadata = {
  title: "取引先を登録",
};

export default function NewTradingPartnerPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* パンくずリスト */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/trading-partners"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          取引先管理
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">新規登録</span>
      </div>

      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">取引先を登録</h1>
        <p className="text-sm text-muted-foreground mt-1">
          取引先の会社名・振込名義・口座情報を登録します
        </p>
      </div>

      {/* フォーム（Client Component） */}
      <TradingPartnerForm />
    </div>
  );
}

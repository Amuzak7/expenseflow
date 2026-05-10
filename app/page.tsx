import { redirect } from "next/navigation";

/**
 * ルートページ: ダッシュボードにリダイレクト
 * middleware.ts でセッションチェックを行い、未認証の場合は /login へ転送される
 */
export default function RootPage() {
  redirect("/dashboard");
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import ExpensesClient from "./ExpensesClient";
import { fetchMyExpenses, fetchPendingApprovals, fetchApprovedExpenses } from "./actions";

export const metadata: Metadata = {
  title: "経費精算",
};

export default async function ExpensesPage() {
  // ── 認証チェック ─────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── ユーザーロール取得 ────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isApprover = ["admin", "approver"].includes(profile?.role ?? "");

  // ── データ並列取得 ────────────────────────────
  const [expenses, pendingItems, approvedItems] = await Promise.all([
    fetchMyExpenses(),
    isApprover ? fetchPendingApprovals() : Promise.resolve([]),
    isApprover ? fetchApprovedExpenses() : Promise.resolve([]),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* ── ページヘッダー ─────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">経費精算</h1>
        <p className="text-sm text-muted-foreground mt-1">
          領収書をアップロードすると、AIが金額・取引先・カテゴリを自動入力します
        </p>
      </div>

      {/* ── メインカード ──────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <ExpensesClient
          initialExpenses={expenses}
          initialPendingItems={pendingItems}
          initialApprovedItems={approvedItems}
          isApprover={isApprover}
        />
      </div>

      {/* ── 注意事項 ─────────────────────────────── */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-4">
        <Receipt className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          AIによる解析結果は参考値です。申請前に必ず内容を確認・修正してください。
          対応形式: JPEG・PNG・WEBP・GIF・PDF（最大10MB）
        </p>
      </div>
    </div>
  );
}

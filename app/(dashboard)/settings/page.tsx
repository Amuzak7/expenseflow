import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  fetchSettingsData,
  fetchExpenseRulesData,
  fetchNotificationSettings,
  fetchOperationLogs,
} from "./actions";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = { title: "設定 | ExpenseFlow" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // プロファイル取得（ロール + セッションタイムアウト）
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, session_timeout_minutes")
    .eq("id", user.id)
    .single();

  const isAdmin        = profile?.role === "admin";
  const sessionTimeout = profile?.session_timeout_minutes ?? 0;

  // データ並列取得
  const [settingsData, expenseRulesData, notifSettings, operationLogs] = await Promise.all([
    isAdmin ? fetchSettingsData()       : Promise.resolve(null),
    isAdmin ? fetchExpenseRulesData()   : Promise.resolve(null),
    fetchNotificationSettings(),
    isAdmin ? fetchOperationLogs(100)   : Promise.resolve([]),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">設定</h1>
        <p className="text-sm text-muted-foreground mt-1">
          会社情報・通知設定などのカスタマイズを行います
        </p>
      </div>
      <SettingsClient
        settingsData={settingsData}
        expenseRulesData={expenseRulesData}
        notifSettings={notifSettings}
        sessionTimeout={sessionTimeout}
        currentUserId={user.id}
        currentUserRole={profile?.role ?? "member"}
        currentUserEmail={user.email ?? ""}
        isAdmin={isAdmin}
        operationLogs={operationLogs}
      />
    </div>
  );
}

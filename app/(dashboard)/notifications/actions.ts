"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import {
  buildApprovedEmail,
  buildRejectedEmail,
  buildReturnedEmail,
} from "@/lib/email-templates";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface NotificationRow {
  id:         string;
  type:       string;   // 'approved' | 'rejected' | 'returned'
  title:      string;
  body:       string;
  expense_id: string | null;
  is_read:    boolean;
  created_at: string;
}

// ─────────────────────────────────────────────
// fetchNotifications: 自分宛て通知一覧を取得（最新50件）
// ─────────────────────────────────────────────

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, expense_id, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[fetchNotifications] DB error:", error);
    return [];
  }

  return (data ?? []) as NotificationRow[];
}

// ─────────────────────────────────────────────
// fetchUnreadNotificationCount: 未読件数を取得
// ─────────────────────────────────────────────

export async function fetchUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("[fetchUnreadNotificationCount] DB error:", error);
    return 0;
  }

  return count ?? 0;
}

// ─────────────────────────────────────────────
// markNotificationRead: 1件を既読にする
// ─────────────────────────────────────────────

export async function markNotificationRead(
  id: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[markNotificationRead] DB error:", error);
    return { ok: false };
  }

  revalidatePath("/");
  return { ok: true };
}

// ─────────────────────────────────────────────
// markAllNotificationsRead: 全件既読にする
// ─────────────────────────────────────────────

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("[markAllNotificationsRead] DB error:", error);
    return { ok: false };
  }

  revalidatePath("/");
  return { ok: true };
}

// ─────────────────────────────────────────────
// createNotification: 通知を作成（内部ヘルパー）
// expenses/actions.ts から呼び出す
// ─────────────────────────────────────────────

export async function createNotification(params: {
  companyId: string;
  userId:    string;   // 受信者（申請者）
  type:      string;
  title:     string;
  body:      string;
  expenseId: string;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").insert({
    company_id: params.companyId,
    user_id:    params.userId,
    type:       params.type,
    title:      params.title,
    body:       params.body,
    expense_id: params.expenseId,
  });

  if (error) {
    // 通知作成失敗はサイレント（本体処理には影響させない）
    console.error("[createNotification] DB error:", error);
  }
}

// ─────────────────────────────────────────────
// sendNotificationEmail: メール通知を送信
// Service Role Key でユーザーのメールアドレスを取得し Resend で送信
// ─────────────────────────────────────────────

export interface EmailNotificationParams {
  userId:        string;   // 受信者（申請者）のユーザーID
  recipientName: string;   // 受信者の氏名
  type:          "approved" | "rejected" | "returned";
  vendor:        string;
  amount:        number;
  date:          string;
  reason?:       string;   // 却下・差し戻し理由
}

export async function sendNotificationEmail(
  params: EmailNotificationParams
): Promise<void> {
  // RESEND_API_KEY が未設定の場合はスキップ（ローカル開発など）
  if (!process.env.RESEND_API_KEY) {
    return;
  }

  // Service Role で auth.users からメールアドレスを取得
  let recipientEmail: string;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(params.userId);
    if (error || !data.user?.email) {
      console.warn("[sendNotificationEmail] メールアドレスの取得に失敗:", error?.message);
      return;
    }
    recipientEmail = data.user.email;
  } catch (err) {
    console.error("[sendNotificationEmail] admin client error:", err);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const base = {
    recipientName: params.recipientName,
    vendor:        params.vendor,
    amount:        params.amount,
    date:          params.date,
    appUrl,
  };

  let subject: string;
  let html: string;

  if (params.type === "approved") {
    ({ subject, html } = buildApprovedEmail(base));
  } else if (params.type === "rejected") {
    ({ subject, html } = buildRejectedEmail({ ...base, reason: params.reason ?? "" }));
  } else {
    ({ subject, html } = buildReturnedEmail({ ...base, reason: params.reason ?? "" }));
  }

  await sendEmail({ to: recipientEmail, subject, html });
}

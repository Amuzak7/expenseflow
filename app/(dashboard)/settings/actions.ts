"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface ProfileWithEmail {
  id:         string;
  full_name:  string | null;
  email:      string;
  role:       string;
  is_active:  boolean;
  status:     "active" | "inactive" | "deleted";
  deleted_at: string | null;
  created_at: string;
}

export interface InvitationRow {
  id:         string;
  email:      string;
  role:       string;
  created_at: string;
  expires_at: string;
}

export interface CompanyInfo {
  id:                   string;
  name:                 string;
  postal_code:          string | null;
  address:              string | null;
  phone:                string | null;
  representative_name:  string | null;
  logo_url:             string | null;
}

export interface SettingsData {
  company:         CompanyInfo;
  users:           ProfileWithEmail[];
  invitations:     InvitationRow[];
  currentUserId:   string;
}

// ─────────────────────────────────────────────
// 内部ヘルパー: RLS を経由せず自分のプロファイルを取得
// profiles の SELECT RLS が再帰するため admin クライアントを使用
// ─────────────────────────────────────────────

async function getOwnProfile(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .single();
  return data as { company_id: string; role: string } | null;
}

// ─────────────────────────────────────────────
// 設定データを取得
// ─────────────────────────────────────────────

export async function fetchSettingsData(): Promise<SettingsData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getOwnProfile(user.id);
  if (!profile?.company_id) return null;
  const companyId = profile.company_id;

  const admin = createAdminClient();
  const [companyResult, profilesResult, invitationsResult] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, postal_code, address, phone, representative_name, logo_url")
      .eq("id", companyId)
      .single(),
    admin
      .from("profiles")
      .select("id, full_name, role, is_active, status, deleted_at, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    admin
      .from("invitations")
      .select("id, email, role, created_at, expires_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ]);

  if (!companyResult.data) return null;

  // Admin クライアントでメールアドレスを取得
  const profiles = (profilesResult.data ?? []) as any[];
  const userIds  = profiles.map((p) => p.id as string);
  const emailMap: Record<string, string> = {};

  if (userIds.length > 0) {
    try {
      const admin = createAdminClient();
      // 最大1000件まで取得（通常の中小企業では十分）
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const au of (authData?.users ?? [])) {
        if (userIds.includes(au.id)) {
          emailMap[au.id] = au.email ?? "";
        }
      }
    } catch (e) {
      console.error("[fetchSettingsData] listUsers error:", e);
    }
  }

  const users: ProfileWithEmail[] = profiles.map((p) => ({
    id:         p.id,
    full_name:  p.full_name ?? null,
    email:      emailMap[p.id] ?? "",
    role:       p.role ?? "member",
    is_active:  p.is_active ?? true,
    status:     (p.status ?? "active") as ProfileWithEmail["status"],
    deleted_at: p.deleted_at ?? null,
    created_at: p.created_at,
  }));

  return {
    company:       companyResult.data as CompanyInfo,
    users,
    invitations:   (invitationsResult.data ?? []) as InvitationRow[],
    currentUserId: user.id,
  };
}

// ─────────────────────────────────────────────
// 会社情報を更新
// ─────────────────────────────────────────────

export async function updateCompanyInfo(formData: {
  name:                string;
  postal_code:         string;
  address:             string;
  phone:               string;
  representative_name: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (!profile?.company_id)    return { error: "会社情報が見つかりません" };
  if (profile.role !== "admin") return { error: "管理者権限が必要です" };
  if (!formData.name.trim())   return { error: "会社名は必須です" };

  const { error } = await supabase
    .from("companies")
    .update({
      name:                formData.name.trim(),
      postal_code:         formData.postal_code.trim()         || null,
      address:             formData.address.trim()             || null,
      phone:               formData.phone.trim()               || null,
      representative_name: formData.representative_name.trim() || null,
    })
    .eq("id", profile.company_id);

  if (error) {
    console.error("[updateCompanyInfo] error:", error);
    return { error: "保存に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// ロゴURLを更新（クライアント側でStorageアップロード後に呼ぶ）
// ─────────────────────────────────────────────

export async function updateLogoUrl(logoUrl: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (!profile?.company_id)    return { error: "会社情報が見つかりません" };
  if (profile.role !== "admin") return { error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("companies")
    .update({ logo_url: logoUrl })
    .eq("id", profile.company_id);

  if (error) return { error: "ロゴの保存に失敗しました" };

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// ユーザーのロールを変更
// ─────────────────────────────────────────────

export async function updateUserRole(userId: string, role: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  if (userId === user.id) return { error: "自分自身のロールは変更できません" };

  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin") return { error: "管理者権限が必要です" };

  const validRoles = ["member", "approver", "admin"];
  if (!validRoles.includes(role)) return { error: "無効なロールです" };

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .eq("company_id", profile!.company_id);

  if (error) {
    console.error("[updateUserRole] error:", error);
    return { error: "ロールの変更に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// 内部ヘルパー: 操作ログを user_operation_logs に記録
// INSERT は service role のみ許可（RLS バイパス）
// ─────────────────────────────────────────────

async function logOperation(opts: {
  admin:        ReturnType<typeof createAdminClient>;
  company_id:   string;
  user_id:      string;
  action:       "disable" | "restore" | "retire" | "permanent_delete";
  performed_by: string;
  reason?:      string;
  metadata?:    Record<string, unknown>;
}) {
  const { error } = await opts.admin
    .from("user_operation_logs")
    .insert({
      company_id:   opts.company_id,
      user_id:      opts.user_id,
      action:       opts.action,
      performed_by: opts.performed_by,
      reason:       opts.reason ?? null,
      metadata:     opts.metadata ?? null,
    });
  if (error) {
    // ログ失敗はメイン処理を止めない
    console.warn("[logOperation] insert error:", error.message);
  }
}

// ─────────────────────────────────────────────
// 内部ヘルパー: 管理者権限 + 同一会社チェック
// ─────────────────────────────────────────────

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" as const, user: null, profile: null };
  if (user.id === userId) return { error: "自分自身は操作できません" as const, user: null, profile: null };

  // RLS 再帰回避のため admin クライアントでロール確認
  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin") return { error: "管理者権限が必要です" as const, user: null, profile: null };
  return { error: null, user, profile: profile! };
}

// ─────────────────────────────────────────────
// ユーザーを無効化（active → inactive）
// ─────────────────────────────────────────────

export async function disableUser(userId: string) {
  const supabase = await createClient();
  const { error: authErr, user, profile } = await assertAdmin(supabase, userId);
  if (authErr) return { error: authErr };

  const admin = createAdminClient();

  // profiles: status を inactive に（トリガーで is_active も false になる）
  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", userId)
    .eq("company_id", profile!.company_id);

  if (profileError) {
    console.error("[disableUser] profile error:", profileError.message);
    return { error: "更新に失敗しました" };
  }

  // Supabase Auth レベルで ban（ログインを物理的にブロック）
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) {
    console.warn("[disableUser] ban error:", banError.message);
    // ban 失敗時は profiles を元に戻す
    await admin.from("profiles").update({ status: "active" }).eq("id", userId);
    return { error: "認証設定の更新に失敗しました" };
  }

  await logOperation({
    admin, company_id: profile!.company_id, user_id: userId,
    action: "disable", performed_by: user!.id,
  });

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// ユーザーを復活（inactive → active）
// ─────────────────────────────────────────────

export async function restoreUser(userId: string) {
  const supabase = await createClient();
  const { error: authErr, user, profile } = await assertAdmin(supabase, userId);
  if (authErr) return { error: authErr };

  const admin = createAdminClient();

  // profiles: status を active に（トリガーで is_active も true になる）
  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("company_id", profile!.company_id);

  if (profileError) {
    console.error("[restoreUser] profile error:", profileError.message);
    return { error: "更新に失敗しました" };
  }

  // Supabase Auth の ban を解除
  const { error: unbanError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanError) {
    console.warn("[restoreUser] unban error:", unbanError.message);
    await admin.from("profiles").update({ status: "inactive" }).eq("id", userId);
    return { error: "認証設定の更新に失敗しました" };
  }

  await logOperation({
    admin, company_id: profile!.company_id, user_id: userId,
    action: "restore", performed_by: user!.id,
  });

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// 退職処理（論理削除: active / inactive → deleted）
// 30日後に自動物理削除するまでの保管状態
// ─────────────────────────────────────────────

export async function retireUser(userId: string, reason?: string) {
  const supabase = await createClient();
  const { error: authErr, user, profile } = await assertAdmin(supabase, userId);
  if (authErr) return { error: authErr };

  const admin = createAdminClient();

  // 退職対象ユーザーの情報をスナップショット（ログ用）
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", userId)
    .single();

  if (!targetProfile) return { error: "対象ユーザーが見つかりません" };
  if (targetProfile.status === "deleted") return { error: "すでに退職処理済みです" };

  // profiles: status を deleted に + deleted_at / deleted_by を記録
  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      status:     "deleted",
      deleted_at: now,
      deleted_by: user!.id,
    })
    .eq("id", userId)
    .eq("company_id", profile!.company_id);

  if (profileError) {
    console.error("[retireUser] profile error:", profileError.message);
    return { error: "退職処理に失敗しました" };
  }

  // Supabase Auth の ban（退職者はログイン不可）
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) {
    console.warn("[retireUser] ban error:", banError.message);
    // ban 失敗時はロールバック
    await admin.from("profiles").update({
      status: targetProfile.status, deleted_at: null, deleted_by: null,
    }).eq("id", userId);
    return { error: "認証設定の更新に失敗しました" };
  }

  await logOperation({
    admin, company_id: profile!.company_id, user_id: userId,
    action: "retire", performed_by: user!.id,
    reason,
    metadata: {
      snapshot_name: targetProfile.full_name,
      snapshot_role: targetProfile.role,
      retired_at:    now,
      // 将来の自動物理削除予定日（30日後）
      scheduled_permanent_delete: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// ユーザーを招待
// ─────────────────────────────────────────────

export async function inviteUser(email: string, role: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin") return { error: "管理者権限が必要です" };
  if (!profile?.company_id)      return { error: "会社情報が見つかりません" };

  // 招待レコードを保存 → 実際の DB レコード（id含む）を返す
  const { data: invData, error: invError } = await supabase
    .from("invitations")
    .insert({
      company_id: profile.company_id,
      email:      email.trim().toLowerCase(),
      role,
      invited_by: user.id,
    })
    .select("id, email, role, created_at, expires_at")
    .single();

  if (invError) {
    if (invError.code === "23505") {
      return { error: "このメールアドレスはすでに招待済みです" };
    }
    console.error("[inviteUser] insert error:", invError);
    return { error: "招待の保存に失敗しました" };
  }

  // Supabase Admin で招待メールを送信
  try {
    const admin = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        company_id: profile.company_id,
        role,
      },
      redirectTo: `${appUrl}/auth/callback`,
    });
    if (authError) {
      console.warn("[inviteUser] invite email error:", authError.message);
      // 招待レコードは保存済みなので、メール失敗のみ警告
    }
  } catch (e) {
    console.error("[inviteUser] admin error:", e);
  }

  revalidatePath("/settings");
  // UI が正確な ID で楽観的更新できるよう invitation レコードを返す
  return { success: true, invitation: invData as InvitationRow };
}

// ─────────────────────────────────────────────
// 招待をキャンセル
// ─────────────────────────────────────────────

export async function cancelInvitation(invitationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  // 削除前に存在確認（楽観的更新で仮IDを渡した場合に備える）
  const { data: existing } = await supabase
    .from("invitations")
    .select("id")
    .eq("id", invitationId)
    .single();

  if (!existing) {
    // 既に削除済み or 存在しない → UI 側の更新だけ通す（成功扱い）
    revalidatePath("/settings");
    return { success: true };
  }

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) {
    console.error("[cancelInvitation] error:", error);
    return { error: "キャンセルに失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ═════════════════════════════════════════════
// Phase 2: 経費ルール設定
// ═════════════════════════════════════════════

export interface ExpenseRule {
  approval_required_amount: number | null;
  receipt_required_amount:  number | null;
}

export interface ExpenseCategory {
  id:         string;
  name:       string;
  is_active:  boolean;
  sort_order: number;
}

export interface ExpenseRulesData {
  rule:       ExpenseRule;
  categories: ExpenseCategory[];
}

// ─────────────────────────────────────────────
// 経費ルールとカテゴリを取得
// ─────────────────────────────────────────────

export async function fetchExpenseRulesData(): Promise<ExpenseRulesData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getOwnProfile(user.id);
  if (!profile?.company_id || profile.role !== "admin") return null;
  const companyId = profile.company_id;

  const admin = createAdminClient();
  const [ruleResult, catsResult] = await Promise.all([
    admin
      .from("expense_rules")
      .select("approval_required_amount, receipt_required_amount")
      .eq("company_id", companyId)
      .single(),
    supabase
      .from("expense_categories")
      .select("id, name, is_active, sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return {
    rule: (ruleResult.data ?? {
      approval_required_amount: null,
      receipt_required_amount:  null,
    }) as ExpenseRule,
    categories: (catsResult.data ?? []) as ExpenseCategory[],
  };
}

// ─────────────────────────────────────────────
// 経費ルール（承認・領収書閾値）を保存
// ─────────────────────────────────────────────

export async function upsertExpenseRules(data: {
  approval_required_amount: number | null;
  receipt_required_amount:  number | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin") return { error: "管理者権限が必要です" };
  if (!profile?.company_id)      return { error: "会社情報が見つかりません" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("expense_rules")
    .upsert(
      {
        company_id:               profile.company_id,
        approval_required_amount: data.approval_required_amount,
        receipt_required_amount:  data.receipt_required_amount,
      },
      { onConflict: "company_id" }
    );

  if (error) {
    console.error("[upsertExpenseRules] error:", error);
    return { error: "保存に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// 経費科目を追加
// ─────────────────────────────────────────────

export async function addExpenseCategory(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin") return { error: "管理者権限が必要です" };
  if (!profile?.company_id)      return { error: "会社情報が見つかりません" };
  if (!name.trim())              return { error: "科目名を入力してください" };

  const admin = createAdminClient();
  // 現在の最大 sort_order を取得
  const { data: maxRow } = await admin
    .from("expense_categories")
    .select("sort_order")
    .eq("company_id", profile.company_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = ((maxRow?.sort_order as number | null) ?? -1) + 1;

  const { data, error } = await admin
    .from("expense_categories")
    .insert({
      company_id: profile.company_id,
      name:       name.trim(),
      sort_order: nextOrder,
    })
    .select("id, name, is_active, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "同じ名前の科目がすでに存在します" };
    console.error("[addExpenseCategory] error:", error);
    return { error: "追加に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true, category: data as ExpenseCategory };
}

// ─────────────────────────────────────────────
// 経費科目名を更新
// ─────────────────────────────────────────────

export async function updateExpenseCategory(id: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  if (!name.trim()) return { error: "科目名を入力してください" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("expense_categories")
    .update({ name: name.trim() })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "同じ名前の科目がすでに存在します" };
    console.error("[updateExpenseCategory] error:", error);
    return { error: "更新に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ─────────────────────────────────────────────
// 経費科目を削除（物理削除）
// ─────────────────────────────────────────────

export async function deleteExpenseCategory(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("expense_categories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[deleteExpenseCategory] error:", error);
    return { error: "削除に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// ═════════════════════════════════════════════
// Phase 2: 通知設定
// ═════════════════════════════════════════════

export interface NotificationSettings {
  email_on_approved:        boolean;
  email_on_rejected:        boolean;
  email_on_returned:        boolean;
  email_on_payment_delayed: boolean;
  email_on_new_request:     boolean;
  app_on_approved:          boolean;
  app_on_rejected:          boolean;
  app_on_returned:          boolean;
  app_on_payment_delayed:   boolean;
}

const DEFAULT_NOTIF_SETTINGS: NotificationSettings = {
  email_on_approved:        true,
  email_on_rejected:        true,
  email_on_returned:        true,
  email_on_payment_delayed: true,
  email_on_new_request:     true,
  app_on_approved:          true,
  app_on_rejected:          true,
  app_on_returned:          true,
  app_on_payment_delayed:   true,
};

// ─────────────────────────────────────────────
// 通知設定を取得（なければデフォルト値を返す）
// ─────────────────────────────────────────────

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_NOTIF_SETTINGS;

  const { data } = await supabase
    .from("notification_settings")
    .select(
      "email_on_approved, email_on_rejected, email_on_returned, email_on_payment_delayed, email_on_new_request, app_on_approved, app_on_rejected, app_on_returned, app_on_payment_delayed"
    )
    .eq("user_id", user.id)
    .single();

  return (data as NotificationSettings | null) ?? DEFAULT_NOTIF_SETTINGS;
}

// ─────────────────────────────────────────────
// 通知設定を保存（upsert）
// ─────────────────────────────────────────────

export async function upsertNotificationSettings(settings: NotificationSettings) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const profile = await getOwnProfile(user.id);
  if (!profile?.company_id) return { error: "会社情報が見つかりません" };

  const { error } = await supabase
    .from("notification_settings")
    .upsert(
      { user_id: user.id, company_id: profile.company_id, ...settings },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[upsertNotificationSettings] error:", error);
    return { error: "保存に失敗しました" };
  }

  return { success: true };
}

// ═════════════════════════════════════════════
// Phase 2: セキュリティ設定
// ═════════════════════════════════════════════

// ═════════════════════════════════════════════
// 操作ログ
// ═════════════════════════════════════════════

export interface OperationLogRow {
  id:             string;
  user_id:        string;
  action:         "disable" | "restore" | "retire" | "permanent_delete";
  performed_by:   string | null;
  performed_at:   string;
  reason:         string | null;
  metadata:       Record<string, unknown> | null;
  // 解決済みの表示用フィールド
  target_name:    string | null;  // metadata.snapshot_name から
  performer_name: string | null;  // profiles から解決
}

// ─────────────────────────────────────────────
// 操作ログを取得（管理者のみ・直近 limit 件）
// ─────────────────────────────────────────────

export async function fetchOperationLogs(limit = 100): Promise<OperationLogRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await getOwnProfile(user.id);
  if (profile?.role !== "admin" || !profile?.company_id) return [];

  const admin = createAdminClient();
  const { data: logs, error } = await admin
    .from("user_operation_logs")
    .select("id, user_id, action, performed_by, performed_at, reason, metadata")
    .eq("company_id", profile.company_id)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error || !logs) {
    console.error("[fetchOperationLogs] error:", error?.message);
    return [];
  }

  // performed_by の名前を解決（削除済みユーザーも含むため全 profiles を検索）
  const performerIds = [
    ...new Set(logs.map((l) => l.performed_by).filter(Boolean) as string[]),
  ];
  const nameMap: Record<string, string> = {};

  if (performerIds.length > 0) {
    const { data: performers } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", performerIds);

    for (const p of performers ?? []) {
      nameMap[p.id] = p.full_name ?? "（名前未設定）";
    }
  }

  return logs.map((l) => ({
    id:             l.id,
    user_id:        l.user_id,
    action:         l.action as OperationLogRow["action"],
    performed_by:   l.performed_by,
    performed_at:   l.performed_at,
    reason:         l.reason ?? null,
    metadata:       (l.metadata as Record<string, unknown> | null) ?? null,
    target_name:    (l.metadata as Record<string, unknown> | null)?.snapshot_name as string | null ?? null,
    performer_name: l.performed_by
      ? (nameMap[l.performed_by] ?? "（削除済みユーザー）")
      : "（自動処理）",
  }));
}

export async function updateSessionTimeout(minutes: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { error } = await supabase
    .from("profiles")
    .update({ session_timeout_minutes: minutes })
    .eq("id", user.id);

  if (error) {
    console.error("[updateSessionTimeout] error:", error);
    return { error: "保存に失敗しました" };
  }

  return { success: true };
}

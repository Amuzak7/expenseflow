"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { analyzeReceiptImage, type ReceiptAnalysis } from "@/lib/claude-vision";
import {
  createNotification,
  sendNotificationEmail,
} from "@/app/(dashboard)/notifications/actions";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const BUCKET = "expense-receipts";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// 添付ファイル用定数
const ATTACHMENT_BUCKET = "expense-attachments";
const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const ATTACHMENT_ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

// ─────────────────────────────────────────────
// 共通型
// ─────────────────────────────────────────────

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────
// analyzeReceipt: 領収書アップロード → Claude Vision 解析
// ─────────────────────────────────────────────

export interface AnalyzeReceiptResult {
  receiptPath: string;
  analysis: ReceiptAnalysis;
}

const DEMO_EMAIL          = "demo@expenseflow.com";
const DAILY_LIMIT_NORMAL  = 5;
const DAILY_LIMIT_DEMO    = 30;

/** 今日の残り解析回数を返す（未認証時は 0） */
export async function getAnalysisUsage(): Promise<{ used: number; limit: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { used: 0, limit: DAILY_LIMIT_NORMAL };

  const limit = user.email === DEMO_EMAIL ? DAILY_LIMIT_DEMO : DAILY_LIMIT_NORMAL;
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("user_usage")
    .select("analysis_count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  return { used: data?.analysis_count ?? 0, limit };
}

export async function analyzeReceipt(
  formData: FormData
): Promise<ActionResult<AnalyzeReceiptResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (!profile?.company_id) {
    return { ok: false, error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  // ── レート制限チェック ────────────────────────
  const dailyLimit = user.email === DEMO_EMAIL ? DAILY_LIMIT_DEMO : DAILY_LIMIT_NORMAL;
  const today = new Date().toISOString().split("T")[0];

  const { data: usageRow } = await supabase
    .from("user_usage")
    .select("analysis_count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  const currentCount = usageRow?.analysis_count ?? 0;
  if (currentCount >= dailyLimit) {
    return {
      ok: false,
      error: `本日の解析上限（${dailyLimit}回）に達しました。明日またお試しください。`,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "対応していないファイル形式です。JPEG・PNG・WEBP・GIF・PDF を選択してください。",
    };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "ファイルサイズが10MBを超えています。" };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");

  const ext = file.name.split(".").pop() ?? "jpg";
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const receiptPath = `${profile.company_id}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(receiptPath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[analyzeReceipt] Storage upload error:", uploadError);
    return { ok: false, error: "ファイルのアップロードに失敗しました。" };
  }

  let analysis: ReceiptAnalysis;
  try {
    analysis = await analyzeReceiptImage(base64, file.type);
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([receiptPath]);
    console.error("[analyzeReceipt] Claude Vision error:", err);
    return { ok: false, error: "AIによる解析に失敗しました。もう一度お試しください。" };
  }

  // ── 利用回数をインクリメント ────────────────────
  await supabase
    .from("user_usage")
    .upsert(
      { user_id: user.id, date: today, analysis_count: currentCount + 1 },
      { onConflict: "user_id,date" }
    );

  return { ok: true, data: { receiptPath, analysis } };
}

// ─────────────────────────────────────────────
// updateExpense: 申請内容を修正（submitted のみ可）
// ─────────────────────────────────────────────

export interface UpdateExpenseInput {
  purpose?:      string;   // 目的・用途（既存レコートとの互換性のため optional）
  date:          string;
  amount:        number;
  taxAmount?:    number;
  vendor:        string;
  category:      string;
  description?:  string;
  paymentMethod: string;
}

const updateExpenseSchema = z.object({
  purpose:       z.string().min(1, "目的・用途を入力してください").optional(),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
  amount:        z.number().int().positive("金額は正の整数で指定してください"),
  taxAmount:     z.number().int().min(0).optional(),
  vendor:        z.string().min(1, "取引先は必須です"),
  category:      z.string().min(1, "カテゴリは必須です"),
  description:   z.string().optional(),
  paymentMethod: z.string().min(1, "支払方法は必須です"),
});

export async function updateExpense(
  id: string,
  input: UpdateExpenseInput
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = updateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。" };
  }
  const v = parsed.data;

  const { data, error } = await supabase
    .from("expenses")
    .update({
      ...(v.purpose !== undefined && { purpose: v.purpose }),
      date:           v.date,
      amount:         v.amount,
      tax_amount:     v.taxAmount ?? null,
      vendor:         v.vendor,
      category:       v.category,
      description:    v.description ?? null,
      payment_method: v.paymentMethod,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["submitted", "returned"])
    .select("id")
    .single();

  if (error || !data) {
    console.error("[updateExpense] DB error:", error);
    return { ok: false, error: "更新に失敗しました。承認待ち・差し戻しの申請のみ編集できます。" };
  }

  revalidatePath("/expenses");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────
// deleteExpense: 申請を取り消し（submitted のみ可）
// ─────────────────────────────────────────────

export async function deleteExpense(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 対象確認
  const { data: expense } = await supabase
    .from("expenses")
    .select("receipt_path, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!expense) return { ok: false, error: "申請が見つかりません。" };
  if (!["submitted", "returned"].includes(expense.status)) {
    return { ok: false, error: "承認待ち・差し戻しの申請のみ取り消しできます。" };
  }

  // DB 削除
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["submitted", "returned"]);

  if (error) {
    console.error("[deleteExpense] DB error:", error);
    return { ok: false, error: "取り消しに失敗しました。" };
  }

  // Storage ファイル削除
  if (expense.receipt_path) {
    await supabase.storage.from(BUCKET).remove([expense.receipt_path]);
  }

  revalidatePath("/expenses");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────
// saveExpense: 解析結果を expenses テーブルに保存して申請
// ─────────────────────────────────────────────

export interface SaveExpenseInput {
  receiptPath:   string;
  purpose:       string;   // 目的・用途（必須）
  date:          string;
  amount:        number;
  taxAmount?:    number;
  vendor:        string;
  category:      string;
  description?:  string;
  paymentMethod: string;
  analysis:      ReceiptAnalysis;
}

export interface SavedExpense {
  id: string;
  status: string;
}

const saveExpenseSchema = z.object({
  receiptPath:   z.string().min(1),
  purpose:       z.string().min(1, "目的・用途を入力してください"),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません（YYYY-MM-DD）"),
  amount:        z.number().int().positive("金額は正の整数で指定してください"),
  taxAmount:     z.number().int().min(0).optional(),
  vendor:        z.string().min(1, "取引先は必須です"),
  category:      z.string().min(1, "カテゴリは必須です"),
  description:   z.string().optional(),
  paymentMethod: z.string().min(1, "支払方法は必須です"),
  analysis:      z.record(z.string(), z.unknown()),
});

export async function saveExpense(
  input: SaveExpenseInput
): Promise<ActionResult<SavedExpense>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (!profile?.company_id) {
    return { ok: false, error: "会社情報が見つかりません。" };
  }

  const parsed = saveExpenseSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { ok: false, error: firstError?.message ?? "入力内容に誤りがあります。" };
  }

  const v = parsed.data;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      company_id:     profile.company_id,
      user_id:        user.id,
      receipt_path:   v.receiptPath,
      purpose:        v.purpose,
      date:           v.date,
      amount:         v.amount,
      tax_amount:     v.taxAmount ?? null,
      vendor:         v.vendor,
      category:       v.category,
      description:    v.description ?? null,
      payment_method: v.paymentMethod,
      analysis:       v.analysis,
      status:         "submitted",
    })
    .select("id, status")
    .single();

  if (error) {
    console.error("[saveExpense] DB error:", error);
    return { ok: false, error: "保存に失敗しました。もう一度お試しください。" };
  }

  return { ok: true, data: { id: data.id, status: data.status } };
}

// ─────────────────────────────────────────────
// fetchMyExpenses: 自分の申請一覧を取得
// ─────────────────────────────────────────────

export interface ExpenseRow {
  id:             string;
  user_id:        string;
  purpose:        string | null;  // 目的・用途
  date:           string | null;
  vendor:         string | null;
  amount:         number | null;
  tax_amount:     number | null;
  category:       string | null;
  payment_method: string | null;
  description:    string | null;
  analysis:       Record<string, unknown> | null;
  status:         string;
  receipt_path:   string | null;
  return_reason:    string | null;  // 差し戻し理由
  rejection_reason: string | null;  // 却下理由
  created_at:       string;
  paid_at:          string | null;
}

export async function fetchMyExpenses(): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, user_id, purpose, date, vendor, amount, tax_amount, category, payment_method, description, analysis, status, receipt_path, return_reason, rejection_reason, created_at, paid_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[fetchMyExpenses] DB error:", error);
    return [];
  }

  return (data ?? []) as ExpenseRow[];
}

// ─────────────────────────────────────────────
// fetchPendingApprovals: 承認待ち一覧（admin/approver 専用）
// ─────────────────────────────────────────────

export interface PendingExpenseRow extends ExpenseRow {
  submitterName: string | null;
}

export async function fetchPendingApprovals(): Promise<PendingExpenseRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ロール・会社ID確認
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !["admin", "approver"].includes(profile.role)) {
    return [];
  }

  // 承認待ち経費を取得
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select(
      "id, user_id, purpose, date, vendor, amount, tax_amount, category, payment_method, description, analysis, status, receipt_path, return_reason, rejection_reason, created_at, paid_at"
    )
    .eq("company_id", profile.company_id)
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[fetchPendingApprovals] DB error:", error);
    return [];
  }
  if (!expenses || expenses.length === 0) return [];

  // 申請者名を profiles テーブルから一括取得してマージ
  const userIds = [...new Set(expenses.map((e) => e.user_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.full_name as string | null])
  );

  return expenses.map((e) => ({
    ...(e as ExpenseRow),
    submitterName: nameMap[e.user_id as string] ?? null,
  }));
}

// ─────────────────────────────────────────────
// approveExpense: 経費申請を承認
// ─────────────────────────────────────────────

export async function approveExpense(
  expenseId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "approver"].includes(profile.role)) {
    return { ok: false, error: "承認権限がありません。" };
  }

  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "approved" })
    .eq("id", expenseId)
    .eq("company_id", profile.company_id)
    .eq("status", "submitted")
    .select("id, user_id, vendor, amount, date")
    .single();

  if (error || !data) {
    console.error("[approveExpense] DB error:", error);
    return { ok: false, error: "承認処理に失敗しました。" };
  }

  // 申請者の氏名を取得
  const submitterId = data.user_id as string;
  const { data: submitterProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", submitterId)
    .single();

  // アプリ内通知を作成
  await createNotification({
    companyId: profile.company_id,
    userId:    submitterId,
    type:      "approved",
    title:     "経費申請が承認されました",
    body:      `${data.vendor ?? "申請"}（${Number(data.amount).toLocaleString()}円）が承認されました。支払いをお待ちください。`,
    expenseId,
  });

  // メール通知を送信
  await sendNotificationEmail({
    userId:        submitterId,
    recipientName: (submitterProfile?.full_name as string | null) ?? "申請者",
    type:          "approved",
    vendor:        (data.vendor as string | null) ?? "（取引先不明）",
    amount:        Number(data.amount),
    date:          (data.date as string | null) ?? "",
  });

  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────
// rejectExpense: 経費申請を却下
// ─────────────────────────────────────────────

export async function rejectExpense(
  expenseId: string,
  reason: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "approver"].includes(profile.role)) {
    return { ok: false, error: "却下権限がありません。" };
  }

  if (!reason.trim()) {
    return { ok: false, error: "却下理由を入力してください。" };
  }

  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "rejected", rejection_reason: reason.trim() })
    .eq("id", expenseId)
    .eq("company_id", profile.company_id)
    .eq("status", "submitted")
    .select("id, user_id, vendor, amount, date")
    .single();

  if (error || !data) {
    console.error("[rejectExpense] DB error:", error);
    return { ok: false, error: "却下処理に失敗しました。" };
  }

  // 申請者の氏名を取得
  const submitterId = data.user_id as string;
  const { data: submitterProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", submitterId)
    .single();

  // アプリ内通知を作成
  await createNotification({
    companyId: profile.company_id,
    userId:    submitterId,
    type:      "rejected",
    title:     "経費申請が却下されました",
    body:      `${data.vendor ?? "申請"}（${Number(data.amount).toLocaleString()}円）が却下されました。理由：${reason.trim()}`,
    expenseId,
  });

  // メール通知を送信
  await sendNotificationEmail({
    userId:        submitterId,
    recipientName: (submitterProfile?.full_name as string | null) ?? "申請者",
    type:          "rejected",
    vendor:        (data.vendor as string | null) ?? "（取引先不明）",
    amount:        Number(data.amount),
    date:          (data.date as string | null) ?? "",
    reason:        reason.trim(),
  });

  revalidatePath("/expenses");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────
// fetchApprovedExpenses: 承認済み・未払い一覧（admin/approver 専用）
// ─────────────────────────────────────────────

export async function fetchApprovedExpenses(): Promise<PendingExpenseRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !["admin", "approver"].includes(profile.role)) {
    return [];
  }

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select(
      "id, user_id, purpose, date, vendor, amount, tax_amount, category, payment_method, description, analysis, status, receipt_path, return_reason, rejection_reason, created_at, paid_at"
    )
    .eq("company_id", profile.company_id)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[fetchApprovedExpenses] DB error:", error);
    return [];
  }
  if (!expenses || expenses.length === 0) return [];

  const userIds = [...new Set(expenses.map((e) => e.user_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.full_name as string | null])
  );

  return expenses.map((e) => ({
    ...(e as ExpenseRow),
    submitterName: nameMap[e.user_id as string] ?? null,
  }));
}

// ─────────────────────────────────────────────
// markAsPaid: 承認済み経費を支払済みに更新
// ─────────────────────────────────────────────

export async function markAsPaid(
  expenseId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "approver"].includes(profile.role)) {
    return { ok: false, error: "支払処理の権限がありません。" };
  }

  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", expenseId)
    .eq("company_id", profile.company_id)
    .eq("status", "approved")
    .select("id")
    .single();

  if (error || !data) {
    console.error("[markAsPaid] DB error:", error);
    return { ok: false, error: "支払処理に失敗しました。" };
  }

  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────
// getReceiptSignedUrl: 領収書の署名付きURL を取得（5分間有効）
// ─────────────────────────────────────────────

export async function getReceiptSignedUrl(
  receiptPath: string
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "未認証です。" };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(receiptPath, 60 * 5); // 5分間有効

  if (error || !data?.signedUrl) {
    console.error("[getReceiptSignedUrl] error:", error);
    return { ok: false, error: "URLの取得に失敗しました。" };
  }

  return { ok: true, data: data.signedUrl };
}

// ─────────────────────────────────────────────
// 添付ファイル関連
// ─────────────────────────────────────────────

export interface AttachmentRow {
  id:          string;
  expense_id:  string;
  file_path:   string;
  file_name:   string;
  file_size:   number | null;
  mime_type:   string | null;
  uploaded_by: string | null;
  created_at:  string;
}

/**
 * uploadExpenseAttachments: 複数の添付ファイルを Storage に保存し DB に記録する
 * @param expenseId 対象の経費申請 ID
 * @param formData  "files" キーで複数の File を含む FormData
 */
export async function uploadExpenseAttachments(
  expenseId: string,
  formData: FormData
): Promise<ActionResult<{ count: number; errors: string[] }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (!profile?.company_id) return { ok: false, error: "会社情報が見つかりません。" };

  // 経費申請が自分のものであることを確認（セキュリティ境界）
  const { data: expense } = await supabase
    .from("expenses")
    .select("id")
    .eq("id", expenseId)
    .eq("user_id", user.id)
    .single();
  if (!expense) return { ok: false, error: "申請が見つかりません。" };

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return { ok: true, data: { count: 0, errors: [] } };

  const successCount: number[] = [];
  const errors: string[] = [];

  for (const file of files) {
    // バリデーション
    if (!ATTACHMENT_ALLOWED_TYPES.has(file.type)) {
      errors.push(`${file.name}: 対応していないファイル形式です`);
      continue;
    }
    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      errors.push(`${file.name}: ファイルサイズが20MBを超えています`);
      continue;
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${profile.company_id}/${expenseId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, buffer, { contentType: file.type });

    if (uploadError) {
      console.error(`[uploadExpenseAttachments] Storage error for ${file.name}:`, uploadError);
      errors.push(`${file.name}: アップロードに失敗しました`);
      continue;
    }

    const { error: dbError } = await supabase
      .from("expense_attachments")
      .insert({
        company_id:  profile.company_id,
        expense_id:  expenseId,
        file_path:   path,
        file_name:   file.name,
        file_size:   file.size,
        mime_type:   file.type,
        uploaded_by: user.id,
      });

    if (dbError) {
      // DB 登録失敗時は Storage からも削除してロールバック
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      console.error(`[uploadExpenseAttachments] DB error for ${file.name}:`, dbError);
      errors.push(`${file.name}: 登録に失敗しました`);
      continue;
    }

    successCount.push(1);
  }

  revalidatePath("/expenses");
  return { ok: true, data: { count: successCount.length, errors } };
}

/**
 * fetchExpenseAttachments: 指定した経費申請の添付ファイル一覧を取得
 */
export async function fetchExpenseAttachments(
  expenseId: string
): Promise<AttachmentRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("expense_attachments")
    .select("id, expense_id, file_path, file_name, file_size, mime_type, uploaded_by, created_at")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchExpenseAttachments] DB error:", error);
    return [];
  }

  return (data ?? []) as AttachmentRow[];
}

/**
 * deleteExpenseAttachment: 添付ファイルを削除（アップロードした本人のみ可）
 */
export async function deleteExpenseAttachment(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ファイルパス取得
  const { data: attachment } = await supabase
    .from("expense_attachments")
    .select("file_path, uploaded_by")
    .eq("id", id)
    .single();

  if (!attachment) return { ok: false, error: "添付ファイルが見つかりません。" };
  if (attachment.uploaded_by !== user.id) return { ok: false, error: "削除権限がありません。" };

  // DB 削除
  const { error: dbError } = await supabase
    .from("expense_attachments")
    .delete()
    .eq("id", id)
    .eq("uploaded_by", user.id);

  if (dbError) {
    console.error("[deleteExpenseAttachment] DB error:", dbError);
    return { ok: false, error: "削除に失敗しました。" };
  }

  // Storage 削除
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.file_path]);

  revalidatePath("/expenses");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────
// returnExpense: 経費申請を差し戻す（admin/approver 専用）
// ─────────────────────────────────────────────

export async function returnExpense(
  expenseId: string,
  reason: string,
  deleteAttachments: boolean = false
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "approver"].includes(profile.role)) {
    return { ok: false, error: "差し戻し権限がありません。" };
  }

  if (!reason.trim()) {
    return { ok: false, error: "差し戻し理由を入力してください。" };
  }

  // 添付ファイルを削除する場合
  if (deleteAttachments) {
    const { data: attachments } = await supabase
      .from("expense_attachments")
      .select("id, file_path")
      .eq("expense_id", expenseId);

    if (attachments && attachments.length > 0) {
      // Storage から一括削除
      const paths = attachments.map((a) => a.file_path as string);
      await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);

      // DB レコードを削除
      await supabase
        .from("expense_attachments")
        .delete()
        .eq("expense_id", expenseId);
    }
  }

  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "returned", return_reason: reason.trim() })
    .eq("id", expenseId)
    .eq("company_id", profile.company_id)
    .eq("status", "submitted")
    .select("id, user_id, vendor, amount, date")
    .single();

  if (error || !data) {
    console.error("[returnExpense] DB error:", error);
    return { ok: false, error: "差し戻し処理に失敗しました。" };
  }

  // 申請者の氏名を取得
  const submitterId = data.user_id as string;
  const { data: submitterProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", submitterId)
    .single();

  // アプリ内通知を作成
  await createNotification({
    companyId: profile.company_id,
    userId:    submitterId,
    type:      "returned",
    title:     "経費申請が差し戻されました",
    body:      `${data.vendor ?? "申請"}（${Number(data.amount).toLocaleString()}円）が差し戻されました。理由：${reason.trim()}`,
    expenseId,
  });

  // メール通知を送信
  await sendNotificationEmail({
    userId:        submitterId,
    recipientName: (submitterProfile?.full_name as string | null) ?? "申請者",
    type:          "returned",
    vendor:        (data.vendor as string | null) ?? "（取引先不明）",
    amount:        Number(data.amount),
    date:          (data.date as string | null) ?? "",
    reason:        reason.trim(),
  });

  revalidatePath("/expenses");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────
// resubmitExpense: 差し戻し済み申請を再申請（本人のみ）
// ─────────────────────────────────────────────

export async function resubmitExpense(
  expenseId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "submitted", return_reason: null })
    .eq("id", expenseId)
    .eq("user_id", user.id)
    .eq("status", "returned")
    .select("id")
    .single();

  if (error || !data) {
    console.error("[resubmitExpense] DB error:", error);
    return { ok: false, error: "再申請に失敗しました。差し戻し済みの申請のみ再申請できます。" };
  }

  revalidatePath("/expenses");
  return { ok: true, data: { id: data.id } };
}

/**
 * getAttachmentSignedUrl: 添付ファイルの署名付きURL を取得（5分間有効）
 */
export async function getAttachmentSignedUrl(
  filePath: string
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "未認証です。" };

  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(filePath, 60 * 5); // 5分間有効

  if (error || !data?.signedUrl) {
    console.error("[getAttachmentSignedUrl] error:", error);
    return { ok: false, error: "URLの取得に失敗しました。" };
  }

  return { ok: true, data: data.signedUrl };
}

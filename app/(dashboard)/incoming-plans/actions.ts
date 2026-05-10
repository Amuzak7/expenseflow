"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

const incomingPlanSchema = z.object({
  trading_partner_id: z.string().uuid().nullable().optional(),
  company_name: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional()
  ),
  alias_name: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional()
  ),
  amount: z
    .number()
    .int()
    .positive("金額は1円以上で入力してください"),
  planned_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "予定入金日を選択してください"),
  memo: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional()
  ),
});

export type IncomingPlanFormData = z.infer<typeof incomingPlanSchema>;

export type IncomingPlanStatus = "pending" | "received" | "cancelled" | "partial" | "delayed";

export interface IncomingPlan {
  id: string;
  trading_partner_id: string | null;
  trading_partner_name: string | null;
  company_name: string | null;
  alias_name: string | null;
  amount: number;
  planned_date: string;
  memo: string | null;
  status: IncomingPlanStatus;
  /** 遅延と判定された日時（status = 'delayed' のときのみ設定） */
  delayed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradingPartnerOption {
  id: string;
  name: string;
  /** プライマリ振込名義（なければ先頭エイリアス） */
  primary_alias: string | null;
  account_number_last4: string | null;
}

type ActionResult = { success: true } | { error: string };

// ─────────────────────────────────────────────
// 入金予定を登録
// ─────────────────────────────────────────────

export async function createIncomingPlan(
  data: IncomingPlanFormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) return { error: "会社情報が見つかりません" };

  const parsed = incomingPlanSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容にエラーがあります" };
  }

  const { error } = await supabase.from("incoming_plans").insert({
    company_id: companyId,
    trading_partner_id: parsed.data.trading_partner_id || null,
    company_name: parsed.data.company_name || null,
    alias_name: parsed.data.alias_name || null,
    amount: parsed.data.amount,
    planned_date: parsed.data.planned_date,
    memo: parsed.data.memo || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) return { error: "登録に失敗しました: " + error.message };

  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 入金予定を更新
// ─────────────────────────────────────────────

export async function updateIncomingPlan(
  id: string,
  data: IncomingPlanFormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) return { error: "会社情報が見つかりません" };

  const parsed = incomingPlanSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容にエラーがあります" };
  }

  const { error } = await supabase
    .from("incoming_plans")
    .update({
      trading_partner_id: parsed.data.trading_partner_id || null,
      company_name: parsed.data.company_name || null,
      alias_name: parsed.data.alias_name || null,
      amount: parsed.data.amount,
      planned_date: parsed.data.planned_date,
      memo: parsed.data.memo || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) return { error: "更新に失敗しました: " + error.message };

  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// ステータス更新
// ─────────────────────────────────────────────

export async function updateIncomingPlanStatus(
  id: string,
  status: IncomingPlanStatus
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) return { error: "会社情報が見つかりません" };

  const { error } = await supabase
    .from("incoming_plans")
    .update({
      status,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) return { error: "ステータス更新に失敗しました: " + error.message };

  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 入金予定を削除
// ─────────────────────────────────────────────

export async function deleteIncomingPlan(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) return { error: "会社情報が見つかりません" };

  const { error } = await supabase
    .from("incoming_plans")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) return { error: "削除に失敗しました: " + error.message };

  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 入金予定一覧を取得（検索・フィルター・ソート・ページネーション対応）
// ─────────────────────────────────────────────

export interface IncomingPlansQueryParams {
  /** 検索ワード（会社名・振込名義・メモ・取引先名） */
  q?: string;
  /** ステータスフィルター: all | pending | overdue | partial | received | cancelled */
  status?: string;
  /** ソート: date_asc | date_desc | amount_asc | amount_desc | status_asc */
  sort?: string;
  /** 期間プリセット: current_month | next_month | past30 | custom */
  period?: string;
  /** カスタム期間 開始日 YYYY-MM-DD */
  dateFrom?: string;
  /** カスタム期間 終了日 YYYY-MM-DD */
  dateTo?: string;
  /** 取引先 ID フィルター */
  partnerId?: string;
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（20 | 50） */
  limit?: number;
}

export interface IncomingPlansResult {
  plans: IncomingPlan[];
  /** フィルター適用後の総件数 */
  total: number;
  /** 現在のページ番号 */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
}

function _toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchIncomingPlans(
  params?: IncomingPlansQueryParams
): Promise<IncomingPlansResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { plans: [], total: 0, page: 1, limit: 20 };

  const q            = params?.q?.trim() ?? "";
  const statusFilter = params?.status    ?? "all";
  const sort         = params?.sort      ?? "date_asc";
  const period       = params?.period    ?? "";
  const dateFrom     = params?.dateFrom  ?? "";
  const dateTo       = params?.dateTo    ?? "";
  const partnerId    = params?.partnerId ?? "";
  const page         = Math.max(1, params?.page  ?? 1);
  const limit        = params?.limit === 50 ? 50 : 20;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = _toDateStr(today);

  // ── テキスト検索: 取引先名を含むために別クエリで ID を取得 ──
  let partnerIdsFromSearch: string[] = [];
  if (q) {
    const { data: companyId } = await supabase.rpc("get_user_company_id");
    if (companyId) {
      const { data: matched } = await supabase
        .from("trading_partners")
        .select("id")
        .eq("company_id", companyId)
        .ilike("name", `%${q}%`);
      partnerIdsFromSearch = (matched ?? []).map((p: { id: string }) => p.id);
    }
  }

  // ── メインクエリ ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("incoming_plans")
    .select(
      `id, trading_partner_id, company_name, alias_name, amount,
       planned_date, memo, status, delayed_at, created_at, updated_at,
       trading_partners ( name )`,
      { count: "exact" }
    );

  // ── ステータスフィルター ──────────────────────────────────
  if (statusFilter === "overdue" || statusFilter === "delayed") {
    // 遅延 = delayed ステータス（cron 設定済み）OR pending かつ期日超過（cron 未実行の場合の互換）
    query = query.or(`status.eq.delayed,and(status.eq.pending,planned_date.lt.${todayStr})`);
  } else if (statusFilter === "pending") {
    // 未入金 = pending かつ期日前（今日以降）
    query = query.eq("status", "pending").gte("planned_date", todayStr);
  } else if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  // ── 期間フィルター ────────────────────────────────────────
  if (period === "current_month") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    query = query.gte("planned_date", _toDateStr(s)).lte("planned_date", _toDateStr(e));
  } else if (period === "next_month") {
    const s = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const e = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    query = query.gte("planned_date", _toDateStr(s)).lte("planned_date", _toDateStr(e));
  } else if (period === "past30") {
    const s = new Date(today);
    s.setDate(s.getDate() - 30);
    query = query.gte("planned_date", _toDateStr(s)).lte("planned_date", todayStr);
  } else if (period === "custom" && dateFrom && dateTo) {
    query = query.gte("planned_date", dateFrom).lte("planned_date", dateTo);
  }

  // ── 取引先フィルター ──────────────────────────────────────
  if (partnerId) {
    query = query.eq("trading_partner_id", partnerId);
  }

  // ── テキスト検索 ──────────────────────────────────────────
  if (q) {
    const orParts: string[] = [
      `company_name.ilike.%${q}%`,
      `alias_name.ilike.%${q}%`,
      `memo.ilike.%${q}%`,
    ];
    if (partnerIdsFromSearch.length > 0) {
      orParts.push(`trading_partner_id.in.(${partnerIdsFromSearch.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  // ── ソート ────────────────────────────────────────────────
  // status_asc はクライアント側でページ内ソートするためサーバーは date_asc と同じ
  const SORT_MAP: Record<string, { column: string; ascending: boolean }[]> = {
    date_asc:    [{ column: "planned_date", ascending: true  }, { column: "created_at", ascending: false }],
    date_desc:   [{ column: "planned_date", ascending: false }, { column: "created_at", ascending: false }],
    amount_asc:  [{ column: "amount",       ascending: true  }, { column: "planned_date", ascending: true }],
    amount_desc: [{ column: "amount",       ascending: false }, { column: "planned_date", ascending: true }],
    status_asc:  [{ column: "planned_date", ascending: true  }, { column: "created_at", ascending: false }],
  };
  for (const col of SORT_MAP[sort] ?? SORT_MAP.date_asc) {
    query = query.order(col.column, { ascending: col.ascending });
  }

  // ── ページネーション ──────────────────────────────────────
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, count, error } = await query;
  if (error || !data) return { plans: [], total: 0, page, limit };

  const plans: IncomingPlan[] = (
    data as {
      id: string;
      trading_partner_id: string | null;
      trading_partners: unknown;
      company_name: string | null;
      alias_name: string | null;
      amount: number;
      planned_date: string;
      memo: string | null;
      status: string;
      delayed_at: string | null;
      created_at: string;
      updated_at: string;
    }[]
  ).map((p) => ({
    id: p.id,
    trading_partner_id: p.trading_partner_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trading_partner_name: (p.trading_partners as any)?.name ?? null,
    company_name: p.company_name,
    alias_name: p.alias_name,
    amount: p.amount,
    planned_date: p.planned_date,
    memo: p.memo,
    status: p.status as IncomingPlanStatus,
    delayed_at: p.delayed_at,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  return { plans, total: count ?? 0, page, limit };
}

// ─────────────────────────────────────────────
// フォーム用：取引先一覧を取得
// ─────────────────────────────────────────────

export async function fetchTradingPartnersForSelect(): Promise<
  TradingPartnerOption[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: companyId } = await supabase.rpc("get_user_company_id");
  if (!companyId) return [];

  const { data } = await supabase
    .from("trading_partners")
    .select(
      "id, name, account_number_last4, trading_partner_aliases(alias_name, is_primary)"
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  if (!data) return [];

  return data.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aliases = (p.trading_partner_aliases as any[]) ?? [];
    const primary = aliases.find((a) => a.is_primary);
    return {
      id: p.id,
      name: p.name,
      primary_alias: primary?.alias_name ?? aliases[0]?.alias_name ?? null,
      account_number_last4: p.account_number_last4,
    };
  });
}

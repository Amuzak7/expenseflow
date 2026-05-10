"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeMatches, type TradingPartnerForMatching } from "@/lib/matching";

// ─────────────────────────────────────────────
// 型定義（Server Action の入出力）
// ─────────────────────────────────────────────

/** クライアントから送信されるCSVパース済みの1行 */
const csvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定"),
  amount: z.number().int().positive("金額は正の整数"),
  senderName: z.string().min(1, "振込人名義は必須"),
  description: z.string().optional(),
  accountLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  remittanceCode: z.string().optional(),
});

const processUploadSchema = z.object({
  /** バッチID（クライアントで生成した UUID、重複アップロード防止に使用） */
  batchId: z.string().uuid(),
  rows: z.array(csvRowSchema).min(1).max(500),
});

// ─────────────────────────────────────────────
// 入金予定マッチ情報（StoredTransaction に付加）
// ─────────────────────────────────────────────

export interface PlanMatchInfo {
  planId: string;
  plannedDate: string;
  plannedAmount: number;
  /** この入金明細で充当した金額 */
  matchedAmount: number;
  /** 実際の入金額 - 予定額（正=過払い、負=不足、0=完全一致） */
  difference: number;
  planStatus: string;
  matchType: "auto" | "manual";
}

/** Server Action が返す1件分のマッチング結果 */
export interface MatchedTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  senderName: string;
  description: string | null;
  status: "unmatched" | "matched" | "ignored";
  matches: Array<{
    matchId: string;
    tradingPartnerId: string;
    tradingPartnerName: string;
    score: number;
    confidence: "high" | "medium" | "low";
    reasons: string[];
    isTopMatch: boolean;
    matchStatus: "pending" | "confirmed" | "rejected";
    /** 手動マッチングで確定された場合 true */
    isManual?: boolean;
  }>;
}

type ProcessResult =
  | { success: true; transactions: MatchedTransaction[]; uploadedCount: number }
  | { error: string };

// ─────────────────────────────────────────────
// 1. CSVアップロード & マッチング実行
// ─────────────────────────────────────────────

/**
 * CSVパース済みデータを受け取り、DBに保存 + マッチングを実行して結果を返す
 *
 * 処理フロー:
 * 1. バリデーション
 * 2. 重複バッチチェック
 * 3. bank_transactions に挿入
 * 4. 取引先マスタ取得 + スコア計算
 * 5. payment_matches に挿入（上位3件）
 * 6. 結果を整形して返す
 */
export async function processCSVUpload(
  rawData: unknown
): Promise<ProcessResult> {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // company_id 取得
  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  // バリデーション
  const parsed = processUploadSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      error: `入力データが不正です: ${parsed.error.issues[0]?.message ?? "不明なエラー"}`,
    };
  }

  const { batchId, rows } = parsed.data;

  // 重複バッチチェック（同一 batchId がすでにあれば警告して続行しない）
  const { count: batchCount } = await supabase
    .from("bank_transactions")
    .select("*", { count: "exact", head: true })
    .eq("upload_batch_id", batchId);

  if (batchCount && batchCount > 0) {
    return {
      error:
        "同一のCSVファイルがすでにアップロードされています（重複防止）。別のファイルを選択してください。",
    };
  }

  // ── bank_transactions に一括挿入 ─────────────
  const txInsertRows = rows.map((row) => ({
    company_id: companyId,
    transaction_date: row.date,
    amount: row.amount,
    sender_name: row.senderName,
    description: row.description ?? null,
    account_number_last4: row.accountLast4 ?? null,
    remittance_code: row.remittanceCode ?? null,
    upload_batch_id: batchId,
    raw_data: row,
    status: "unmatched" as const,
  }));

  const { data: insertedTxs, error: txError } = await supabase
    .from("bank_transactions")
    .insert(txInsertRows)
    .select(
      "id, transaction_date, amount, sender_name, description, account_number_last4, remittance_code, status"
    );

  if (txError || !insertedTxs) {
    console.error("[processCSVUpload] 明細挿入エラー:", txError);
    return { error: `明細の保存に失敗しました: ${txError?.message ?? "不明"}` };
  }

  // ── 取引先マスタ取得 ──────────────────────────
  const { data: partners } = await supabase
    .from("trading_partners")
    .select("id, name, account_number_last4, remittance_code, trading_partner_aliases(alias_name)")
    .eq("company_id", companyId);

  const partnerList: TradingPartnerForMatching[] = (partners ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    account_number_last4: p.account_number_last4,
    remittance_code: p.remittance_code ?? null,
    trading_partner_aliases: p.trading_partner_aliases ?? [],
  }));

  // ── マッチング計算 & payment_matches 挿入 ─────
  const matchInsertRows: Array<{
    bank_transaction_id: string;
    trading_partner_id: string;
    score: number;
    match_reason: object;
    is_top_match: boolean;
    status: string;
  }> = [];

  /** トランザクションIDごとのマッチ候補（UI返却用） */
  const txMatchMap = new Map<
    string,
    {
      matches: Array<{
        tradingPartnerId: string;
        tradingPartnerName: string;
        score: number;
        confidence: "high" | "medium" | "low";
        reasons: string[];
        isTopMatch: boolean;
      }>;
    }
  >();

  for (const tx of insertedTxs) {
    if (partnerList.length === 0) {
      txMatchMap.set(tx.id, { matches: [] });
      continue;
    }

    const candidates = computeMatches(
      {
        senderName: tx.sender_name,
        amount: tx.amount,
        accountLast4: tx.account_number_last4 ?? undefined,
        remittanceCode: tx.remittance_code ?? undefined,
      },
      partnerList
    );

    // 上位 3 件だけ保存
    const top3 = candidates.slice(0, 3);

    top3.forEach((c, idx) => {
      matchInsertRows.push({
        bank_transaction_id: tx.id,
        trading_partner_id: c.tradingPartnerId,
        score: c.score,
        match_reason: {
          reasons: c.reasons,
          confidence: c.confidence,
          remittanceCodeMatched: c.remittanceCodeMatched ?? false,
        },
        is_top_match: idx === 0,
        status: "pending",
      });
    });

    txMatchMap.set(tx.id, {
      matches: top3.map((c, idx) => ({
        tradingPartnerId: c.tradingPartnerId,
        tradingPartnerName: c.tradingPartnerName,
        score: c.score,
        confidence: c.confidence,
        reasons: c.reasons,
        isTopMatch: idx === 0,
      })),
    });
  }

  // payment_matches 一括挿入
  const insertedMatchIds = new Map<string, string[]>(); // txId → matchId[]
  if (matchInsertRows.length > 0) {
    const { data: insertedMatches, error: matchError } = await supabase
      .from("payment_matches")
      .insert(matchInsertRows)
      .select("id, bank_transaction_id, is_top_match");

    if (matchError) {
      console.error("[processCSVUpload] マッチ挿入エラー:", matchError);
      // マッチング保存に失敗しても、明細は保存済みなので処理続行
    } else if (insertedMatches) {
      for (const m of insertedMatches) {
        const existing = insertedMatchIds.get(m.bank_transaction_id) ?? [];
        existing.push(m.id);
        insertedMatchIds.set(m.bank_transaction_id, existing);
      }
    }
  }

  // ── 結果を整形 ────────────────────────────────
  const transactions: MatchedTransaction[] = insertedTxs.map((tx) => {
    const txMatches = txMatchMap.get(tx.id)?.matches ?? [];
    const matchIds = insertedMatchIds.get(tx.id) ?? [];

    return {
      id: tx.id,
      transactionDate: tx.transaction_date,
      amount: tx.amount,
      senderName: tx.sender_name,
      description: tx.description,
      status: tx.status as "unmatched" | "matched" | "ignored",
      matches: txMatches.map((m, idx) => ({
        matchId: matchIds[idx] ?? "",
        tradingPartnerId: m.tradingPartnerId,
        tradingPartnerName: m.tradingPartnerName,
        score: m.score,
        confidence: m.confidence,
        reasons: m.reasons,
        isTopMatch: m.isTopMatch,
        matchStatus: "pending" as const,
      })),
    };
  });

  revalidatePath("/incoming-payments");
  return { success: true, transactions, uploadedCount: transactions.length };
}

// ─────────────────────────────────────────────
// 2. マッチング確定
// ─────────────────────────────────────────────

type ConfirmResult = { success: true } | { error: string };

/**
 * 指定した payment_match を「確定」する
 * - payment_matches.status → 'confirmed'
 * - bank_transactions.status → 'matched'
 * - 同一明細の他の候補は 'rejected' に更新
 */
export async function confirmMatch(
  transactionId: string,
  matchId: string
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId } = await supabase.rpc("get_user_company_id");

  // 取引先名を監査ログ用に取得
  const { data: matchInfo } = await supabase
    .from("payment_matches")
    .select("trading_partner_id, trading_partners(name)")
    .eq("id", matchId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerName: string | null = (matchInfo?.trading_partners as any)?.name ?? null;

  // 確定するマッチを更新
  const { error: matchError } = await supabase
    .from("payment_matches")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: user.id })
    .eq("id", matchId);

  if (matchError) {
    return { error: `確定処理に失敗しました: ${matchError.message}` };
  }

  // 同一明細の他の候補を rejected に
  await supabase
    .from("payment_matches")
    .update({ status: "rejected" })
    .eq("bank_transaction_id", transactionId)
    .neq("id", matchId);

  // 明細のステータスを matched に更新
  const { error: txError } = await supabase
    .from("bank_transactions")
    .update({ status: "matched" })
    .eq("id", transactionId);

  if (txError) {
    return { error: `明細ステータスの更新に失敗しました: ${txError.message}` };
  }

  if (companyId) {
    await insertAuditLog(supabase, {
      companyId,
      transactionId,
      action: "confirmed",
      tradingPartnerName: partnerName,
      performedBy: user.id,
    });
  }

  // ── 入金予定との自動マッチング ─────────────
  if (companyId && matchInfo?.trading_partner_id) {
    const { data: txForPlan } = await supabase
      .from("bank_transactions")
      .select("amount, sender_name, transaction_date")
      .eq("id", transactionId)
      .single();
    if (txForPlan) {
      await _autoMatchIncomingPlan(supabase, {
        companyId,
        bankTransactionId: transactionId,
        tradingPartnerId: matchInfo.trading_partner_id,
        transactionAmount: txForPlan.amount,
        senderName: txForPlan.sender_name,
        transactionDate: txForPlan.transaction_date,
        matchType: "auto",
        userId: user.id,
      });
    }
  }

  revalidatePath("/incoming-payments");
  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 3. 明細を無視
// ─────────────────────────────────────────────

/**
 * 指定した bank_transaction を「無視」する
 * - bank_transactions.status → 'ignored'
 * - 全ての payment_matches → 'rejected'
 */
export async function ignoreTransaction(
  transactionId: string
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId } = await supabase.rpc("get_user_company_id");

  const now = new Date().toISOString();
  const { error: txError } = await supabase
    .from("bank_transactions")
    .update({ status: "ignored", ignored_at: now, ignored_by: user.id })
    .eq("id", transactionId);

  if (txError) {
    return { error: `無視処理に失敗しました: ${txError.message}` };
  }

  await supabase
    .from("payment_matches")
    .update({ status: "rejected" })
    .eq("bank_transaction_id", transactionId);

  if (companyId) {
    await insertAuditLog(supabase, {
      companyId,
      transactionId,
      action: "ignored",
      performedBy: user.id,
    });
  }

  revalidatePath("/incoming-payments");
  return { success: true };
}

// ─────────────────────────────────────────────
// 4. DBから入金明細一覧を取得（ページ再レンダリング用）
// ─────────────────────────────────────────────

export interface StoredTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  senderName: string;
  description: string | null;
  status: "unmatched" | "matched" | "ignored";
  uploadBatchId: string | null;
  /** 確定日時（status=matched）または無視日時（status=ignored） */
  processedAt: string | null;
  /** 確定または無視した担当者名 */
  processedByName: string | null;
  /** 操作履歴（確定・無視・取り消しなど）*/
  auditLogs: Array<{
    id: string;
    action: "confirmed" | "ignored" | "reverted" | "manual_matched" | "batch_confirmed";
    tradingPartnerName: string | null;
    performedByName: string | null;
    performedAt: string;
  }>;
  /** 紐づいた入金予定の情報（確定済み & マッチした場合のみ存在） */
  planMatch: PlanMatchInfo | null;
  matches: Array<{
    matchId: string;
    tradingPartnerId: string | null;
    tradingPartnerName: string | null;
    score: number;
    confidence: "high" | "medium" | "low";
    reasons: string[];
    isTopMatch: boolean;
    matchStatus: "pending" | "confirmed" | "rejected";
    /** 手動マッチングで確定された場合 true */
    isManual?: boolean;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertAuditLog(supabase: any, params: {
  companyId: string;
  transactionId: string;
  action: string;
  tradingPartnerName?: string | null;
  performedBy: string;
}): Promise<void> {
  try {
    await supabase.from("transaction_audit_logs").insert({
      company_id: params.companyId,
      bank_transaction_id: params.transactionId,
      action: params.action,
      trading_partner_name: params.tradingPartnerName ?? null,
      performed_by: params.performedBy,
    });
  } catch {
    // 監査ログ失敗は主処理をブロックしない
  }
}

export async function fetchIncomingPayments(options?: {
  statusFilter?: "unmatched" | "matched" | "ignored";
  /** 開始日 YYYY-MM-DD（inclusive） */
  dateFrom?: string;
  /** 終了日 YYYY-MM-DD（inclusive） */
  dateTo?: string;
}): Promise<StoredTransaction[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("bank_transactions")
    .select(
      `id, transaction_date, amount, sender_name, description, status, upload_batch_id,
       ignored_at, ignored_by,
       payment_matches(
         id, trading_partner_id, score, match_reason, is_top_match, status,
         confirmed_at, confirmed_by,
         trading_partners(name)
       )`
    )
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (options?.statusFilter) {
    query = query.eq("status", options.statusFilter);
  }
  if (options?.dateFrom) {
    query = query.gte("transaction_date", options.dateFrom);
  }
  if (options?.dateTo) {
    query = query.lte("transaction_date", options.dateTo);
  }

  const { data } = await query;
  if (!data) return [];

  // 監査ログを一括取得
  const txIds = data.map((tx) => tx.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auditData: any[] = [];
  if (txIds.length > 0) {
    const { data: logs } = await supabase
      .from("transaction_audit_logs")
      .select("id, bank_transaction_id, action, trading_partner_name, performed_by, performed_at")
      .in("bank_transaction_id", txIds)
      .order("performed_at", { ascending: true });
    auditData = logs ?? [];
  }

  // 入金予定マッチを一括取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let planMatchData: any[] = [];
  if (txIds.length > 0) {
    const { data: pmData } = await supabase
      .from("incoming_plan_matches")
      .select(
        "bank_transaction_id, incoming_plan_id, matched_amount, match_type, incoming_plans(amount, planned_date, status)"
      )
      .in("bank_transaction_id", txIds);
    planMatchData = pmData ?? [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planMatchMap = new Map<string, any>();
  for (const pm of planMatchData) {
    // 同一明細に複数マッチがある場合、先頭（最初の紐づけ）を優先
    if (!planMatchMap.has(pm.bank_transaction_id)) {
      planMatchMap.set(pm.bank_transaction_id, pm);
    }
  }

  // 担当者名を一括取得（confirmed_by + ignored_by + audit performed_by の全ユーザー ID）
  const userIds = new Set<string>();
  for (const tx of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((tx as any).ignored_by) userIds.add((tx as any).ignored_by);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (tx.payment_matches as any[]) ?? []) {
      if (m.confirmed_by) userIds.add(m.confirmed_by);
    }
  }
  for (const log of auditData) {
    if (log.performed_by) userIds.add(log.performed_by);
  }

  const nameMap: Record<string, string | null> = {};
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...userIds]);
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.full_name as string | null;
    }
  }

  // txId → auditLogs のマップ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditMap = new Map<string, any[]>();
  for (const log of auditData) {
    const existing = auditMap.get(log.bank_transaction_id) ?? [];
    existing.push(log);
    auditMap.set(log.bank_transaction_id, existing);
  }

  return data.map((tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawMatches: any[] = t.payment_matches ?? [];

    // 処理日時・担当者を解決
    let processedAt: string | null = null;
    let processedByName: string | null = null;

    if (t.status === "matched") {
      const confirmedMatch = rawMatches.find((m) => m.status === "confirmed");
      if (confirmedMatch) {
        processedAt = confirmedMatch.confirmed_at ?? null;
        processedByName = confirmedMatch.confirmed_by
          ? (nameMap[confirmedMatch.confirmed_by] ?? null)
          : null;
      }
    } else if (t.status === "ignored") {
      processedAt = t.ignored_at ?? null;
      processedByName = t.ignored_by ? (nameMap[t.ignored_by] ?? null) : null;
    }

    // 監査ログをマッピング
    const txAuditLogs = (auditMap.get(t.id) ?? []).map((l) => ({
      id: l.id,
      action: l.action as StoredTransaction["auditLogs"][number]["action"],
      tradingPartnerName: l.trading_partner_name ?? null,
      performedByName: l.performed_by ? (nameMap[l.performed_by] ?? null) : null,
      performedAt: l.performed_at,
    }));

    const pm = planMatchMap.get(t.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planData = pm ? (pm.incoming_plans as any) : null;

    return {
      id: t.id,
      transactionDate: t.transaction_date,
      amount: t.amount,
      senderName: t.sender_name,
      description: t.description,
      status: t.status as StoredTransaction["status"],
      uploadBatchId: t.upload_batch_id,
      processedAt,
      processedByName,
      auditLogs: txAuditLogs,
      planMatch:
        pm && planData
          ? {
              planId: pm.incoming_plan_id as string,
              plannedDate: planData.planned_date as string,
              plannedAmount: planData.amount as number,
              matchedAmount: pm.matched_amount as number,
              difference: (pm.matched_amount as number) - (planData.amount as number),
              planStatus: planData.status as string,
              matchType: pm.match_type as "auto" | "manual",
            }
          : null,
      matches: rawMatches
        .sort((a, b) => b.score - a.score)
        .map((m) => ({
          matchId: m.id,
          tradingPartnerId: m.trading_partner_id,
          tradingPartnerName: m.trading_partners?.name ?? null,
          score: m.score,
          confidence: (m.match_reason?.confidence ?? "low") as
            | "high"
            | "medium"
            | "low",
          reasons: m.match_reason?.reasons ?? [],
          isTopMatch: m.is_top_match,
          matchStatus: m.status as "pending" | "confirmed" | "rejected",
          isManual: m.match_reason?.isManual === true,
        })),
    };
  });
}

// ─────────────────────────────────────────────
// 5. 取引先検索（手動マッチング用）
// ─────────────────────────────────────────────

export interface TradingPartnerSearchResult {
  id: string;
  name: string;
  /** 登録されている振込名義エイリアス一覧 */
  aliasNames: string[];
}

/**
 * 取引先マスタを会社名・振込名義で検索する
 *
 * - query 未指定（空文字）の場合は全件を返す（手動マッチモーダルの初期表示用）
 * - 最大 50 件を返す（SMB向けのため全件取得 + クライアントフィルタリング）
 */
export async function searchTradingPartners(
  query: string
): Promise<TradingPartnerSearchResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) return [];

  // 全取引先 + エイリアスを取得してサーバーサイドフィルタリング
  // SMB向けのため件数は少ない想定（数十〜数百件）
  const { data, error } = await supabase
    .from("trading_partners")
    .select("id, name, trading_partner_aliases(alias_name)")
    .eq("company_id", companyId)
    .order("name");

  if (error || !data) return [];

  const trimmed = query.trim().toLowerCase();

  return data
    .map((p) => ({
      id: p.id,
      name: p.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aliasNames: ((p.trading_partner_aliases as any[]) ?? []).map(
        (a) => a.alias_name as string
      ),
    }))
    .filter((p) => {
      if (!trimmed) return true;
      return (
        p.name.toLowerCase().includes(trimmed) ||
        p.aliasNames.some((a) => a.toLowerCase().includes(trimmed))
      );
    })
    .slice(0, 50);
}

// ─────────────────────────────────────────────
// 6. 手動マッチング確定
// ─────────────────────────────────────────────

/**
 * 指定した取引先を bank_transaction に手動でマッチングして確定する
 *
 * 処理フロー:
 * 1. 認証 + 自社データの所有確認（セキュリティ）
 * 2. 既存の payment_matches をすべて rejected に
 * 3. 新しい payment_match を confirmed で挿入（isManual: true）
 * 4. bank_transactions.status → 'matched'
 */
export async function manualMatchTransaction(
  transactionId: string,
  tradingPartnerId: string
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  // セキュリティ検証: 明細が自社のものか確認
  const { data: tx, error: txFetchError } = await supabase
    .from("bank_transactions")
    .select("id, status")
    .eq("id", transactionId)
    .eq("company_id", companyId)
    .single();

  if (txFetchError || !tx) {
    return { error: "明細が見つかりません" };
  }
  if (tx.status === "matched") {
    return { error: "この明細はすでに確定済みです" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txData = tx as any;

  // セキュリティ検証: 取引先が自社のものか確認
  const { data: partner, error: partnerFetchError } = await supabase
    .from("trading_partners")
    .select("id, name")
    .eq("id", tradingPartnerId)
    .eq("company_id", companyId)
    .single();

  if (partnerFetchError || !partner) {
    return { error: "指定した取引先が見つかりません" };
  }

  // 既存のマッチ候補をすべて rejected に
  await supabase
    .from("payment_matches")
    .update({ status: "rejected" })
    .eq("bank_transaction_id", transactionId);

  // 手動マッチを confirmed で新規挿入
  // match_reason.isManual = true で手動確定フラグを記録
  const { error: insertError } = await supabase.from("payment_matches").insert({
    bank_transaction_id: transactionId,
    trading_partner_id: tradingPartnerId,
    score: 100,
    match_reason: {
      reasons: ["手動マッチング"],
      confidence: "high",
      isManual: true,
    },
    is_top_match: true,
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
  });

  if (insertError) {
    console.error("[manualMatchTransaction] 挿入エラー:", insertError);
    return {
      error: `手動マッチングの保存に失敗しました: ${insertError.message}`,
    };
  }

  // 明細ステータスを matched に更新
  const { error: txUpdateError } = await supabase
    .from("bank_transactions")
    .update({ status: "matched" })
    .eq("id", transactionId);

  if (txUpdateError) {
    return {
      error: `明細ステータスの更新に失敗しました: ${txUpdateError.message}`,
    };
  }

  await insertAuditLog(supabase, {
    companyId,
    transactionId,
    action: "manual_matched",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tradingPartnerName: (partner as any).name ?? null,
    performedBy: user.id,
  });

  // ── 入金予定との手動マッチング ─────────────
  await _autoMatchIncomingPlan(supabase, {
    companyId,
    bankTransactionId: transactionId,
    tradingPartnerId,
    transactionAmount: txData.amount,
    senderName: txData.sender_name,
    transactionDate: txData.transaction_date,
    matchType: "manual",
    userId: user.id,
  });

  revalidatePath("/incoming-payments");
  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 7. 確定・無視の取り消し（未確認に戻す）
// ─────────────────────────────────────────────

/**
 * 確定済み・無視済みの明細を「未確認」ステータスに戻す
 *
 * 処理フロー:
 * 1. bank_transactions.status → 'unmatched'、ignored_at/ignored_by をクリア
 * 2. payment_matches をすべて 'pending' に戻し、confirmed_at/confirmed_by をクリア
 */
export async function revertTransaction(
  transactionId: string
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  // セキュリティ検証: 明細が自社のものか確認
  const { data: tx, error: txFetchError } = await supabase
    .from("bank_transactions")
    .select("id, status")
    .eq("id", transactionId)
    .eq("company_id", companyId)
    .single();

  if (txFetchError || !tx) {
    return { error: "明細が見つかりません" };
  }
  if (tx.status === "unmatched") {
    return { error: "この明細はすでに未確認状態です" };
  }

  // ── 入金予定マッチの解除（先に取得してから削除） ──
  const { data: planMatchesToRevert } = await supabase
    .from("incoming_plan_matches")
    .select("incoming_plan_id")
    .eq("bank_transaction_id", transactionId);

  await supabase
    .from("incoming_plan_matches")
    .delete()
    .eq("bank_transaction_id", transactionId);

  // bank_transactions を unmatched に戻し、無視日時・担当者をクリア
  const { error: txError } = await supabase
    .from("bank_transactions")
    .update({
      status: "unmatched",
      ignored_at: null,
      ignored_by: null,
    })
    .eq("id", transactionId);

  if (txError) {
    return { error: `ステータスの更新に失敗しました: ${txError.message}` };
  }

  // payment_matches を pending に戻し、確定情報をクリア
  await supabase
    .from("payment_matches")
    .update({
      status: "pending",
      confirmed_at: null,
      confirmed_by: null,
    })
    .eq("bank_transaction_id", transactionId);

  // 影響を受けた入金予定のステータスを再計算
  for (const pm of (planMatchesToRevert ?? []) as { incoming_plan_id: string }[]) {
    await _recalculateIncomingPlanStatus(supabase, pm.incoming_plan_id, companyId);
  }

  await insertAuditLog(supabase, {
    companyId,
    transactionId,
    action: "reverted",
    performedBy: user.id,
  });

  revalidatePath("/incoming-payments");
  revalidatePath("/incoming-plans");
  return { success: true };
}

// ─────────────────────────────────────────────
// 8. バッチ一括確定
// ─────────────────────────────────────────────

/** バッチ確定の1件分 */
export interface BatchConfirmItem {
  transactionId: string;
  /** 確定したい payment_match の ID（上位マッチの matchId） */
  matchId: string;
}

type BatchConfirmResult =
  | { success: true; confirmedCount: number }
  | { error: string };

/**
 * 複数の入金明細を一括で確定する（バッチ処理）
 *
 * 単体の confirmMatch を N 回呼ぶと N × 3 クエリになるため、
 * バッチ版では合計 3 クエリで処理する:
 *   Step 1: 対象明細の全マッチを一括 rejected
 *   Step 2: 選択したマッチを一括 confirmed
 *   Step 3: 明細ステータスを一括 matched
 *
 * セキュリティ:
 *   - 全明細が自社のものかを事前検証
 *   - すでに確定済みの明細はスキップ（エラーにはしない）
 */
export async function batchConfirmMatches(
  items: BatchConfirmItem[]
): Promise<BatchConfirmResult> {
  if (items.length === 0) {
    return { error: "確定する明細を選択してください" };
  }
  if (items.length > 100) {
    return { error: "一度に確定できる明細は 100 件までです" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  const requestedTxIds = [...new Set(items.map((i) => i.transactionId))];

  // セキュリティ検証: 全明細が自社のものか・未確定かを確認
  const { data: txs, error: txFetchError } = await supabase
    .from("bank_transactions")
    .select("id, status")
    .in("id", requestedTxIds)
    .eq("company_id", companyId);

  if (txFetchError || !txs) {
    return { error: "明細の取得に失敗しました" };
  }

  // status === "unmatched" のものだけ処理対象に絞る（確定済み・無視はスキップ）
  const validTxIds = new Set(
    txs.filter((t) => t.status === "unmatched").map((t) => t.id)
  );

  const validItems = items.filter((i) => validTxIds.has(i.transactionId));
  if (validItems.length === 0) {
    return {
      error: "確定可能な明細がありません（すでに確定済みの可能性があります）",
    };
  }

  const validTransactionIds = [...new Set(validItems.map((i) => i.transactionId))];
  const validMatchIds = validItems.map((i) => i.matchId);

  // ── Step 1: 対象明細の全マッチを一括 rejected ────
  const { error: rejectError } = await supabase
    .from("payment_matches")
    .update({ status: "rejected" })
    .in("bank_transaction_id", validTransactionIds);

  if (rejectError) {
    console.error("[batchConfirmMatches] reject エラー:", rejectError);
    return { error: `マッチのリセットに失敗しました: ${rejectError.message}` };
  }

  // ── Step 2: 選択したマッチを一括 confirmed ────────
  const confirmedAt = new Date().toISOString();
  const { error: confirmError } = await supabase
    .from("payment_matches")
    .update({ status: "confirmed", confirmed_at: confirmedAt, confirmed_by: user.id })
    .in("id", validMatchIds);

  if (confirmError) {
    console.error("[batchConfirmMatches] confirm エラー:", confirmError);
    return { error: `確定処理に失敗しました: ${confirmError.message}` };
  }

  // ── Step 3: 明細ステータスを一括 matched ──────────
  const { error: txUpdateError } = await supabase
    .from("bank_transactions")
    .update({ status: "matched" })
    .in("id", validTransactionIds);

  if (txUpdateError) {
    console.error("[batchConfirmMatches] tx update エラー:", txUpdateError);
    return {
      error: `明細ステータスの更新に失敗しました: ${txUpdateError.message}`,
    };
  }

  // ── Step 4: 監査ログを一括挿入 ───────────────────
  // matchId → 取引先名 のマップを作成
  const { data: matchPartners } = await supabase
    .from("payment_matches")
    .select("id, trading_partners(name)")
    .in("id", validMatchIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchPartnerMap = new Map<string, string | null>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (matchPartners ?? []).map((m: any) => [m.id, m.trading_partners?.name ?? null])
  );

  const auditRows = validItems.map((item) => ({
    company_id: companyId,
    bank_transaction_id: item.transactionId,
    action: "batch_confirmed",
    trading_partner_name: matchPartnerMap.get(item.matchId) ?? null,
    performed_by: user.id,
  }));
  await supabase.from("transaction_audit_logs").insert(auditRows);

  // ── Step 5: 入金予定との自動マッチング（バッチ） ──
  const { data: matchInfosForPlan } = await supabase
    .from("payment_matches")
    .select("id, trading_partner_id, bank_transaction_id")
    .in("id", validMatchIds);

  const { data: txInfosForPlan } = await supabase
    .from("bank_transactions")
    .select("id, amount, sender_name, transaction_date")
    .in("id", validTransactionIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchMatchInfoMap = new Map<string, { tradingPartnerId: string; txId: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (matchInfosForPlan ?? []).map((m: any) => [
      m.id,
      { tradingPartnerId: m.trading_partner_id, txId: m.bank_transaction_id },
    ])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchTxInfoMap = new Map<string, { amount: number; senderName: string; transactionDate: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (txInfosForPlan ?? []).map((t: any) => [
      t.id,
      { amount: t.amount, senderName: t.sender_name, transactionDate: t.transaction_date },
    ])
  );

  for (const item of validItems) {
    const mi = batchMatchInfoMap.get(item.matchId);
    const ti = batchTxInfoMap.get(item.transactionId);
    if (mi?.tradingPartnerId && ti) {
      await _autoMatchIncomingPlan(supabase, {
        companyId,
        bankTransactionId: item.transactionId,
        tradingPartnerId: mi.tradingPartnerId,
        transactionAmount: ti.amount,
        senderName: ti.senderName,
        transactionDate: ti.transactionDate,
        matchType: "auto",
        userId: user.id,
      });
    }
  }

  revalidatePath("/incoming-payments");
  revalidatePath("/incoming-plans");
  return { success: true, confirmedCount: validItems.length };
}

// ─────────────────────────────────────────────
// 内部ヘルパー: 入金予定との自動マッチング
// ─────────────────────────────────────────────

interface _AutoMatchParams {
  companyId: string;
  bankTransactionId: string;
  tradingPartnerId: string;
  transactionAmount: number;
  senderName: string;
  transactionDate: string;
  matchType: "auto" | "manual";
  userId: string;
}

/**
 * 確定した入金明細に対応する入金予定を自動で検索・紐づけする。
 *
 * マッチング優先順位:
 *   1. 金額完全一致 (+100点)
 *   2. 金額 ±5% 以内 (+70点)
 *   3. 金額 ±20% 以内 (+40点)
 *   4. 振込名義一致 (+30点 bonus)
 *   5. 日付近接 +20点 (7日以内) / +10点 (31日以内)
 *
 * 候補が1件しかない場合はスコアに関わらず紐づける。
 * 複数候補がある場合はスコアが0より大きい最高候補を選ぶ。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _autoMatchIncomingPlan(supabase: any, params: _AutoMatchParams): Promise<void> {
  // 同一明細がすでに紐づいていれば重複登録しない
  const { data: existing } = await supabase
    .from("incoming_plan_matches")
    .select("id")
    .eq("bank_transaction_id", params.bankTransactionId)
    .limit(1);
  if (existing && existing.length > 0) return;

  // 該当取引先の未入金・一部入金予定を取得
  const { data: plans } = await supabase
    .from("incoming_plans")
    .select("id, amount, planned_date, alias_name")
    .eq("company_id", params.companyId)
    .eq("trading_partner_id", params.tradingPartnerId)
    .in("status", ["pending", "partial"])
    .order("planned_date", { ascending: true });

  if (!plans || plans.length === 0) return;

  // スコアリングして最良の候補を選ぶ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scored = (plans as any[])
    .map((plan) => ({ plan, score: _scorePlanMatch(plan, params) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  // 候補が複数あってスコアが0なら紐づけない（どれか判断できない）
  if (!best || (best.score === 0 && plans.length > 1)) return;

  const matchReason = _buildMatchReason(best.plan, params);

  const { error } = await supabase.from("incoming_plan_matches").insert({
    company_id: params.companyId,
    incoming_plan_id: best.plan.id,
    bank_transaction_id: params.bankTransactionId,
    matched_amount: params.transactionAmount,
    match_type: params.matchType,
    match_reason: matchReason,
    created_by: params.userId,
  });

  if (error) {
    console.error("[_autoMatchIncomingPlan] 挿入エラー:", error);
    return;
  }

  // 入金予定のステータスを再計算
  await _recalculateIncomingPlanStatus(supabase, best.plan.id, params.companyId);
}

/** 入金予定候補のマッチングスコアを算出する */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _scorePlanMatch(plan: any, params: _AutoMatchParams): number {
  let score = 0;

  // 金額類似度
  const diff = Math.abs(plan.amount - params.transactionAmount);
  const pct = plan.amount > 0 ? diff / plan.amount : 1;
  if (diff === 0) score += 100;
  else if (pct <= 0.05) score += 70;
  else if (pct <= 0.20) score += 40;

  // 振込名義一致（bonus）
  if (plan.alias_name) {
    const norm = (s: string) => s.replace(/[\s　]/g, "").toUpperCase();
    const ns = norm(params.senderName);
    const na = norm(plan.alias_name as string);
    if (ns.includes(na) || na.includes(ns)) score += 30;
  }

  // 日付近接度
  const planMs = new Date((plan.planned_date as string) + "T00:00:00").getTime();
  const txMs = new Date(params.transactionDate + "T00:00:00").getTime();
  const days = Math.abs((planMs - txMs) / (1000 * 60 * 60 * 24));
  if (days <= 7) score += 20;
  else if (days <= 31) score += 10;

  return score;
}

/** マッチング理由の説明文を生成する */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _buildMatchReason(plan: any, params: _AutoMatchParams): string {
  const diff = Math.abs(plan.amount - params.transactionAmount);
  const pct = plan.amount > 0 ? diff / plan.amount : 1;
  if (diff === 0) return "金額完全一致";
  if (pct <= 0.05) return `金額近似（${(pct * 100).toFixed(1)}%差）`;
  if (pct <= 0.20) return `金額近似（${(pct * 100).toFixed(1)}%差）`;
  return "取引先一致（単一候補）";
}

/**
 * 入金予定の紐づけ合計額を集計して status を再計算・更新する。
 * 全マッチ削除後 → pending、充当合計 < 予定額 → partial、≥ 予定額 → received
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _recalculateIncomingPlanStatus(supabase: any, planId: string, companyId: string): Promise<void> {
  const { data: plan } = await supabase
    .from("incoming_plans")
    .select("amount, status")
    .eq("id", planId)
    .eq("company_id", companyId)
    .single();

  if (!plan || plan.status === "cancelled") return;

  const { data: matches } = await supabase
    .from("incoming_plan_matches")
    .select("matched_amount")
    .eq("incoming_plan_id", planId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = ((matches ?? []) as any[]).reduce(
    (sum: number, m: { matched_amount: number }) => sum + m.matched_amount,
    0
  );

  const newStatus =
    total === 0 ? "pending" : total >= (plan.amount as number) ? "received" : "partial";

  if (newStatus !== plan.status) {
    await supabase
      .from("incoming_plans")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("company_id", companyId);
  }
}

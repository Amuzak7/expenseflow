"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────
// 月次レポート型定義
// ─────────────────────────────────────────────

export interface MonthlyReportData {
  year:        number;
  month:       number;
  companyName: string;
  generatedAt: string;

  /** 入金予定サマリー（選択月の planned_date ベース） */
  incoming: {
    totalCount:    number;
    totalAmount:   number;
    receivedCount: number;
    receivedAmount: number;
    pendingCount:  number;
    pendingAmount: number;
    delayedCount:  number;
    delayedAmount: number;
    receiveRate:   number; // 0〜100 (%)
  };

  /** 実績入金サマリー（選択月の bank_transactions.transaction_date ベース） */
  actualIncoming: {
    matchedCount:    number;
    matchedAmount:   number;
    unmatchedCount:  number;
    unmatchedAmount: number;
    totalCount:      number;
    totalAmount:     number;
  };

  /** 経費サマリー（選択月の date ベース） */
  expenses: {
    submittedCount:   number;
    submittedAmount:  number;
    approvedCount:    number;
    approvedAmount:   number;
    currentPending:   number; // 現在時点の承認待ち件数
    categoryBreakdown: Array<{
      category: string;
      count:    number;
      amount:   number;
    }>;
  };
}

// ─────────────────────────────────────────────
// 月次レポートデータを取得
// ─────────────────────────────────────────────

export async function fetchMonthlyReport(
  year:  number,
  month: number
): Promise<MonthlyReportData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 月の開始日・終了日
  const mm   = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const last = new Date(year, month, 0).getDate();
  const to   = `${year}-${mm}-${String(last).padStart(2, "0")}`;
  const todayStr = new Date().toISOString().split("T")[0];

  // 会社名取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  const companyName = await (async () => {
    if (!profile?.company_id) return "（会社名不明）";
    const { data } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .single();
    return (data?.name as string | null) ?? "（会社名不明）";
  })();

  // ── 並列取得 ────────────────────────────────
  const [plansResult, expensesResult, pendingCountResult, bankTxResult] = await Promise.all([
    // 入金予定（選択月 planned_date）
    supabase
      .from("incoming_plans")
      .select("amount, status, planned_date")
      .gte("planned_date", from)
      .lte("planned_date", to),

    // 経費（選択月 date）
    supabase
      .from("expenses")
      .select("amount, category, status")
      .gte("date", from)
      .lte("date", to)
      .in("status", ["submitted", "approved", "paid"]),

    // 現在の承認待ち件数（月に関係なくリアルタイム）
    supabase
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),

    // 実績入金（選択月 transaction_date ベース）
    supabase
      .from("bank_transactions")
      .select("amount, status")
      .in("status", ["matched", "unmatched"])
      .gte("transaction_date", from)
      .lte("transaction_date", to),
  ]);

  if (plansResult.error || expensesResult.error) {
    console.error("[fetchMonthlyReport] error:", plansResult.error ?? expensesResult.error);
    return null;
  }
  if (bankTxResult.error) {
    console.error("[fetchMonthlyReport] bank_transactions error:", bankTxResult.error);
  }

  const plans   = plansResult.data   ?? [];
  const expenses = expensesResult.data ?? [];

  // ── 入金集計 ─────────────────────────────────
  const nonCancelled = plans.filter((p) => p.status !== "cancelled");
  const received     = plans.filter((p) => p.status === "received");
  const delayed      = plans.filter(
    (p) =>
      p.status === "delayed" ||
      (p.status === "pending" && p.planned_date < todayStr)
  );
  const pending = plans.filter(
    (p) => p.status === "pending" && p.planned_date >= todayStr
  );

  const sum = (arr: { amount: number }[]) =>
    arr.reduce((s, x) => s + (x.amount ?? 0), 0);

  const totalAmount    = sum(nonCancelled);
  const receivedAmount = sum(received);
  const receiveRate    =
    totalAmount > 0 ? Math.round((receivedAmount / totalAmount) * 100) : 0;

  // ── 実績入金集計（銀行明細ベース）──────────────
  const bankTxs    = (bankTxResult.data ?? []) as { amount: number; status: string }[];
  const matched    = bankTxs.filter((t) => t.status === "matched");
  const unmatched  = bankTxs.filter((t) => t.status === "unmatched");
  const sumTx = (arr: { amount: number }[]) =>
    arr.reduce((s, x) => s + (x.amount ?? 0), 0);

  // ── 経費集計 ─────────────────────────────────
  const approved = expenses.filter((e) =>
    ["approved", "paid"].includes(e.status)
  );

  // 科目別内訳
  const catMap = new Map<string, { count: number; amount: number }>();
  for (const e of approved) {
    const cat = (e.category as string | null) ?? "その他";
    const cur = catMap.get(cat) ?? { count: 0, amount: 0 };
    catMap.set(cat, { count: cur.count + 1, amount: cur.amount + (e.amount ?? 0) });
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, { count, amount }]) => ({ category, count, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    year,
    month,
    companyName,
    generatedAt: new Date().toISOString(),

    incoming: {
      totalCount:     nonCancelled.length,
      totalAmount,
      receivedCount:  received.length,
      receivedAmount,
      pendingCount:   pending.length,
      pendingAmount:  sum(pending),
      delayedCount:   delayed.length,
      delayedAmount:  sum(delayed),
      receiveRate,
    },

    actualIncoming: {
      matchedCount:    matched.length,
      matchedAmount:   sumTx(matched),
      unmatchedCount:  unmatched.length,
      unmatchedAmount: sumTx(unmatched),
      totalCount:      bankTxs.length,
      totalAmount:     sumTx(bankTxs),
    },

    expenses: {
      submittedCount:  expenses.length,
      submittedAmount: sum(expenses),
      approvedCount:   approved.length,
      approvedAmount:  sum(approved),
      currentPending:  pendingCountResult.count ?? 0,
      categoryBreakdown,
    },
  };
}

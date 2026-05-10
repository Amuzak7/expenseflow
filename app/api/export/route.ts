import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

type ExportType   = "incoming-plans" | "bank-transactions" | "expenses";
type ExportFormat = "csv" | "xlsx";

type SafeValue = string | number;
type SafeRow   = Record<string, SafeValue>;

// ─────────────────────────────────────────────
// ヘルパー関数（変更なし）
// ─────────────────────────────────────────────

function safe(s: unknown): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (["undefined", "null", "nan", "none"].includes(str.toLowerCase())) return "";
  return str;
}

function fmtNum(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmtDate(d: unknown): string {
  if (d === null || d === undefined || d === "") return "";
  const str = String(d);
  if (["undefined", "null", "nan", "none"].includes(str.toLowerCase())) return "";
  try {
    const dt = new Date(str);
    if (!Number.isFinite(dt.getTime())) return "";
    return dt.toLocaleDateString("ja-JP");
  } catch {
    return "";
  }
}

const STATUS_JA: Record<string, string> = {
  pending:   "未入金",
  received:  "入金済み",
  cancelled: "キャンセル",
  partial:   "一部入金",
  delayed:   "遅延",
  unmatched: "未確認",
  matched:   "確認済み",
  ignored:   "無視",
  submitted: "承認待ち",
  approved:  "承認済み",
  paid:      "支払済み",
  rejected:  "却下",
  returned:  "差し戻し",
};

function fmtStatus(s: unknown): string {
  if (s === null || s === undefined) return "";
  const key = String(s);
  return STATUS_JA[key] ?? safe(key);
}

function joinedName(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) {
    const first = v[0];
    if (!first || typeof first !== "object") return "";
    return safe((first as Record<string, unknown>).name);
  }
  if (typeof v === "object") {
    return safe((v as Record<string, unknown>).name);
  }
  return "";
}

function sanitizeRow(row: Record<string, unknown>): SafeRow {
  const result: SafeRow = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === "number") {
      result[key] = Number.isFinite(val) ? val : 0;
    } else {
      result[key] = safe(val);
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// GET /api/export
// ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const type        = (searchParams.get("type")    ?? "incoming-plans") as ExportType;
  const format      = (searchParams.get("format")  ?? "xlsx") as ExportFormat;
  const dateFrom    = searchParams.get("dateFrom") ?? "";
  const dateTo      = searchParams.get("dateTo")   ?? "";
  const statusParam = searchParams.get("status");

  const validTypes:   ExportType[]   = ["incoming-plans", "bank-transactions", "expenses"];
  const validFormats: ExportFormat[] = ["csv", "xlsx"];
  if (!validTypes.includes(type) || !validFormats.includes(format)) {
    return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
  }
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "期間を指定してください" }, { status: 400 });
  }

  // ── 会社確認 ────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.json({ error: "会社情報が見つかりません" }, { status: 403 });
  }

  const companyId = profile.company_id;   // ← ここに移動！（超重要）

  // ─────────────────────────────────────────────
  // データ取得
  // ─────────────────────────────────────────────

  let rows: SafeRow[] = [];
  let fileName = "";

  // ── 入金予定データ ──────────────────────────
  if (type === "incoming-plans") {
    let query: any = supabase
      .from("incoming_plans")
      .select(`
        id,
        planned_date,
        amount,
        status,
        company_name,
        alias_name,
        memo,
        delayed_at,
        created_at,
        trading_partners ( name )
      `)
      .eq("company_id", companyId)                    // ← 追加
      .gte("planned_date", dateFrom)
      .lte("planned_date", dateTo)
      .order("planned_date", { ascending: true });

    if (statusParam) {
      if (statusParam === "delayed") {
        const today = new Date().toISOString().split("T")[0];
        query = query.or(
          `status.eq.delayed,and(status.eq.pending,planned_date.lt.${today})`
        );
      } else {
        query = query.eq("status", statusParam);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("[export] incoming_plans error:", error);
      return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
    }

    rows = ((data ?? []) as any[]).map((p) => {
      const partnerName   = joinedName(p.trading_partners);
      const companyName   = safe(p.company_name);
      const effectiveName = partnerName || companyName;

      return sanitizeRow({
        "予定日":       fmtDate(p.planned_date),
        "会社名":       effectiveName,
        "振込名義":     safe(p.alias_name),
        "予定金額":     fmtNum(p.amount),
        "ステータス":   fmtStatus(p.status),
        "メモ":         safe(p.memo),
        "遅延検知日":   fmtDate(p.delayed_at),
        "登録日":       fmtDate(p.created_at),
      });
    });

    console.log(`[export] incoming-plans | companyId=${companyId} | 取得件数=${rows.length}`);
    fileName = `入金予定データ_${dateFrom}_${dateTo}`;
  }

  // ── 入金確認データ（実績）────────────────────
  else if (type === "bank-transactions") {
    let query: any = supabase
      .from("bank_transactions")
      .select(`
        id,
        transaction_date,
        amount,
        sender_name,
        description,
        account_number_last4,
        status,
        created_at
      `)
      .eq("company_id", companyId)                    // ← 追加
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: true });

    if (statusParam) {
      query = query.eq("status", statusParam);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[export] bank_transactions error:", JSON.stringify(error));
      return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
    }

    rows = ((data ?? []) as any[]).map((t) =>
      sanitizeRow({
        "取引日":           fmtDate(t.transaction_date),
        "入金額":           fmtNum(t.amount),
        "振込人名義":       safe(t.sender_name),
        "摘要":             safe(t.description),
        "口座番号（下4桁）": safe(t.account_number_last4),
        "マッチング状況":   fmtStatus(t.status),
        "登録日":           fmtDate(t.created_at),
      })
    );

    console.log(`[export] bank-transactions | companyId=${companyId} | 取得件数=${rows.length}`);
    fileName = `入金確認データ_${dateFrom}_${dateTo}`;
  }

  // ── 経費精算データ ───────────────────────────
  else {
    let query: any = supabase
      .from("expenses")
      .select(`
        id,
        date,
        vendor,
        amount,
        category,
        description,
        status,
        user_id,
        created_at
      `)
      .eq("company_id", companyId)                    // ← 追加
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    if (statusParam) {
      query = query.eq("status", statusParam);
    } else {
      query = query.in("status", ["submitted", "approved", "paid", "rejected", "returned"]);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[export] expenses error:", JSON.stringify(error));
      return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
    }

    const expenseRows = (data ?? []) as any[];

    const userIds = [...new Set(expenseRows.map((e) => e.user_id as string).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = safe(p.full_name);
      }
    }

    rows = expenseRows.map((e) =>
      sanitizeRow({
        "申請日":     fmtDate(e.date),
        "申請者":     safe(nameMap[e.user_id]),
        "支払先":     safe(e.vendor),
        "科目":       safe(e.category),
        "金額":       fmtNum(e.amount),
        "概要":       safe(e.description),
        "ステータス": fmtStatus(e.status),
        "登録日":     fmtDate(e.created_at),
      })
    );

    console.log(`[export] expenses | companyId=${companyId} | 取得件数=${rows.length}`);
    fileName = `経費精算データ_${dateFrom}_${dateTo}`;
  }

  // ─────────────────────────────────────────────
  // ファイル生成（変更なし）
  // ─────────────────────────────────────────────

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    worksheet["!cols"] = headers.map((h) => {
      const maxLen = Math.max(
        h.length * 2,
        ...rows.map((r) => String(r[h] ?? "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "データ");

  let blob: Blob;

  if (format === "xlsx") {
    const uint8 = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      compression: true,
    }) as Uint8Array;

    blob = new Blob([uint8 as unknown as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob(["\uFEFF" + csv], { type: "text/csv; charset=utf-8" });
  }

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName + "." + format)}`,
      "Cache-Control": "no-store",
    },
  });
}

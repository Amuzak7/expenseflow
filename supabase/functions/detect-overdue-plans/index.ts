/**
 * detect-overdue-plans — Supabase Edge Function
 *
 * pending の入金予定のうち planned_date が過去のものを delayed に更新し、
 * 新たに遅延となった予定の件数を返す。
 *
 * 呼び出し方:
 *   1. pg_cron から SQL 関数経由で自動実行（推奨）
 *   2. HTTP POST で手動実行（テスト・緊急時）
 *      curl -X POST \
 *        https://<project-ref>.supabase.co/functions/v1/detect-overdue-plans \
 *        -H "Authorization: Bearer <EDGE_FUNCTION_SECRET>"
 *
 * 環境変数（Supabase Edge Function Settings で設定）:
 *   SUPABASE_URL             — 自動設定
 *   SUPABASE_SERVICE_ROLE_KEY — 自動設定（RLS バイパス用）
 *   EDGE_FUNCTION_SECRET      — 任意の共有シークレット（不正呼び出し防止）
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface OverdueResult {
  executedAt:   string;
  updatedCount: number;
  newlyDelayed: Array<{
    id:          string;
    companyId:   string;
    plannedDate: string;
    amount:      number;
    partnerName: string | null;
    companyName: string | null;
  }>;
}

Deno.serve(async (req: Request) => {
  // ── CORS プリフライト ─────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── 認証チェック ─────────────────────────────
  const secret = Deno.env.get("EDGE_FUNCTION_SECRET");
  if (secret) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${secret}`) {
      console.error("[detect-overdue-plans] Unauthorized call");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── Supabase クライアント（Service Role） ─────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now   = new Date();
  const today = now.toISOString().split("T")[0]; // YYYY-MM-DD

  // ── 新たに遅延となる予定を取得（更新前に記録） ──
  const { data: toBeDelayed, error: fetchError } = await supabase
    .from("incoming_plans")
    .select(`
      id,
      company_id,
      planned_date,
      amount,
      company_name,
      trading_partners ( name )
    `)
    .eq("status", "pending")
    .lt("planned_date", today);

  if (fetchError) {
    console.error("[detect-overdue-plans] Fetch error:", fetchError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch overdue plans", details: fetchError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const toUpdate = toBeDelayed ?? [];
  console.log(`[detect-overdue-plans] Found ${toUpdate.length} plans to mark delayed`);

  if (toUpdate.length === 0) {
    const result: OverdueResult = {
      executedAt:   now.toISOString(),
      updatedCount: 0,
      newlyDelayed: [],
    };
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── delayed に一括更新 ───────────────────────
  const ids = toUpdate.map((p: { id: string }) => p.id);

  const { error: updateError } = await supabase
    .from("incoming_plans")
    .update({
      status:     "delayed",
      delayed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .in("id", ids);

  if (updateError) {
    console.error("[detect-overdue-plans] Update error:", updateError);
    return new Response(
      JSON.stringify({ error: "Failed to update plans", details: updateError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── 結果を整形 ────────────────────────────────
  const newlyDelayed = toUpdate.map((p: {
    id: string;
    company_id: string;
    planned_date: string;
    amount: number;
    company_name: string | null;
    trading_partners: unknown;
  }) => ({
    id:          p.id,
    companyId:   p.company_id,
    plannedDate: p.planned_date,
    amount:      p.amount,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    partnerName: (p.trading_partners as any)?.name ?? null,
    companyName: p.company_name,
  }));

  const result: OverdueResult = {
    executedAt:   now.toISOString(),
    updatedCount: toUpdate.length,
    newlyDelayed,
  };

  console.log(`[detect-overdue-plans] Successfully marked ${toUpdate.length} plans as delayed`);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});

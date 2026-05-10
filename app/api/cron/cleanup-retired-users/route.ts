/**
 * 退職処理済みユーザーの自動物理削除 Cron ジョブ
 *
 * スケジュール: 毎日 00:00 JST (15:00 UTC) — vercel.json 参照
 *
 * 処理対象:
 *   profiles.status = 'deleted' かつ deleted_at が 30日以上前のユーザー
 *
 * 処理内容:
 *   1. 対象ユーザーの関連データを削除 (expenses, incoming_plans)
 *   2. profiles レコードを削除
 *   3. Supabase Auth ユーザーを削除
 *   4. user_operation_logs に permanent_delete を記録
 *
 * セキュリティ:
 *   Authorization: Bearer <CRON_SECRET> ヘッダーが必須
 *   Vercel Cron は自動でこのヘッダーを付与する
 *   手動実行の場合は .env.local の CRON_SECRET を使うこと
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

interface CleanupTarget {
  id:         string;
  company_id: string | null;
  full_name:  string | null;
  deleted_at: string | null;
}

interface CleanupResult {
  userId: string;
  name:   string | null;
  status: "deleted" | "failed";
  error?: string;
}

// ─────────────────────────────────────────────
// 1ユーザー分の完全削除処理
// ─────────────────────────────────────────────

async function permanentDeleteUser(
  admin:  ReturnType<typeof createAdminClient>,
  target: CleanupTarget
): Promise<CleanupResult> {
  const { id: userId, company_id, full_name } = target;

  try {
    // 関連データを順次削除（存在しなくてもエラーにしない）
    await admin.from("expenses").delete().eq("user_id", userId);
    await admin.from("incoming_plans").delete().eq("user_id", userId);
    await admin.from("incoming_plans").delete().eq("created_by", userId);
    await admin.from("profiles").delete().eq("id", userId);

    // Supabase Auth ユーザーを削除（これが失敗したら全体失敗）
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`Auth削除エラー: ${authError.message}`);

    // 操作ログに記録（performed_by は null = 自動処理）
    const { error: logError } = await admin
      .from("user_operation_logs")
      .insert({
        company_id,
        user_id:      userId,
        action:       "permanent_delete",
        performed_by: null,
        reason:       "退職処理後30日経過による自動物理削除",
        metadata: {
          snapshot_name: full_name,
          deleted_via:   "auto_cron_30days",
          cron_run_at:   new Date().toISOString(),
        },
      });

    if (logError) {
      // ログ失敗はユーザー削除の成功を妨げない
      console.warn(`[cron/cleanup] log error for ${userId}:`, logError.message);
    }

    console.log(`[cron/cleanup] 完全削除完了: userId=${userId} name=${full_name ?? "(不明)"}`);
    return { userId, name: full_name, status: "deleted" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/cleanup] 削除失敗: userId=${userId}`, message);
    return { userId, name: full_name, status: "failed", error: message };
  }
}

// ─────────────────────────────────────────────
// GET /api/cron/cleanup-retired-users
// ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── 認証: CRON_SECRET チェック ─────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/cleanup] CRON_SECRET が設定されていません");
    return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[cron/cleanup] 不正なアクセス: Authorization ヘッダーが無効");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  console.log(`[cron/cleanup] ジョブ開始 at=${startedAt}`);

  const admin = createAdminClient();

  // ── 削除対象ユーザーを取得（30日以上前に retired） ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: targets, error: queryError } = await admin
    .from("profiles")
    .select("id, company_id, full_name, deleted_at")
    .eq("status", "deleted")
    .lt("deleted_at", thirtyDaysAgo);

  if (queryError) {
    console.error("[cron/cleanup] クエリエラー:", queryError.message);
    return NextResponse.json(
      { error: "対象ユーザーの取得に失敗しました" },
      { status: 500 }
    );
  }

  const targetList = (targets ?? []) as CleanupTarget[];

  if (targetList.length === 0) {
    console.log("[cron/cleanup] 削除対象なし。終了。");
    return NextResponse.json({
      success:   true,
      processed: 0,
      deleted:   0,
      failed:    0,
      results:   [],
    });
  }

  console.log(`[cron/cleanup] 削除対象: ${targetList.length} 件`);

  // ── 各ユーザーを順次処理 ──────────────────
  const results: CleanupResult[] = [];
  for (const target of targetList) {
    const result = await permanentDeleteUser(admin, target);
    results.push(result);
  }

  const deleted = results.filter((r) => r.status === "deleted").length;
  const failed  = results.filter((r) => r.status === "failed").length;

  console.log(
    `[cron/cleanup] ジョブ完了 deleted=${deleted} failed=${failed} at=${new Date().toISOString()}`
  );

  return NextResponse.json({
    success: true,
    processed: results.length,
    deleted,
    failed,
    results,
  });
}

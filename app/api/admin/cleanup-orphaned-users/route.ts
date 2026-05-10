/**
 * ⚠️ このエンドポイントは無効化されています。
 *
 * 経緯:
 *  - 以前は孤立したAuthユーザーを一括削除するために使用されていた。
 *  - 管理者権限チェックをスキップしていたため、セキュリティリスクがあった。
 *  - ユーザー削除設計を「論理削除優先」に変更したため本エンドポイントは廃止。
 *
 * 代替手段:
 *  - 退職処理: PATCH /api/admin/users/[id]/retire (または Server Action: retireUser)
 *  - 完全削除: DELETE /api/admin/users/[id] （管理者 + 確認ダイアログ必須）
 *  - 孤立ユーザーのクリーンアップが必要な場合は Supabase SQL Editor で直接実行すること
 *    （アクセス権を持つ担当者のみ）
 *
 * 再有効化が必要な場合:
 *  環境変数 CLEANUP_API_ENABLED=true を設定してください。
 *  ただし本番環境では絶対に有効化しないこと。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────
// POST /api/admin/cleanup-orphaned-users
// ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 環境変数による明示的な有効化が必要 ────────
  if (process.env.CLEANUP_API_ENABLED !== "true") {
    console.warn(
      "[cleanup] アクセス拒否: このエンドポイントは無効化されています。" +
      " CLEANUP_API_ENABLED=true を設定した場合のみ使用可能です。"
    );
    return NextResponse.json(
      {
        error:  "このエンドポイントは無効化されています",
        detail: "ユーザー管理画面から退職処理・完全削除を行ってください",
      },
      { status: 410 }  // 410 Gone: 意図的に廃止
    );
  }

  // ── 以下は CLEANUP_API_ENABLED=true の場合のみ到達 ──
  // 認証必須（管理者チェックは意図的にスキップ = 開発環境専用）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let userIds: string[];
  try {
    const body = await req.json();
    if (!Array.isArray(body?.userIds) || body.userIds.length === 0) {
      return NextResponse.json({ error: "userIds（string[]）を指定してください" }, { status: 400 });
    }
    userIds = body.userIds.filter(
      (id: unknown) => typeof id === "string" && id.trim() !== ""
    );
    if (userIds.length === 0) {
      return NextResponse.json({ error: "有効なuserIdがありません" }, { status: 400 });
    }
    // 安全のため上限を設ける
    if (userIds.length > 10) {
      return NextResponse.json({ error: "一度に削除できるのは10件までです" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  console.warn(
    `[cleanup] ⚠️ 実行 requestedBy=${user.id} at=${new Date().toISOString()} targets=${userIds.join(",")}`
  );

  const admin = createAdminClient();
  const results = [];

  for (const userId of userIds) {
    try {
      await admin.from("expenses").delete().eq("user_id", userId);
      await admin.from("incoming_plans").delete().eq("user_id", userId);
      await admin.from("incoming_plans").delete().eq("created_by", userId);
      await admin.from("profiles").delete().eq("id", userId);

      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr) {
        results.push({ userId, status: "failed", error: authErr.message });
      } else {
        results.push({ userId, status: "deleted" });
      }
    } catch (err) {
      results.push({ userId, status: "failed", error: String(err) });
    }
  }

  return NextResponse.json({ success: true, results }, { status: 200 });
}

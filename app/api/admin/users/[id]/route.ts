import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

interface DeleteResult {
  table:   string;
  deleted: number | null;
  error:   string | null;
}

// ─────────────────────────────────────────────
// ヘルパー: 関連データを順次削除して結果を返す
// 将来的に Soft Delete（deleted_at）に切り替える場合は
// 各 .delete() を .update({ deleted_at: new Date().toISOString() }) に変更する
// ─────────────────────────────────────────────

async function deleteRelatedData(
  admin:  ReturnType<typeof createAdminClient>,
  userId: string
): Promise<DeleteResult[]> {
  const results: DeleteResult[] = [];

  // ── 1. expenses（申請者として紐付くレコード）────
  {
    const { error, count } = await admin
      .from("expenses")
      .delete({ count: "exact" })
      .eq("user_id", userId);

    results.push({
      table:   "expenses",
      deleted: count ?? null,
      error:   error?.message ?? null,
    });
  }

  // ── 2. incoming_plans（作成者として紐付くレコード）──
  // user_id または created_by のどちらかに該当する行を削除
  // 将来的に deleted_at を追加する場合はここを変更
  {
    const { error: e1, count: c1 } = await admin
      .from("incoming_plans")
      .delete({ count: "exact" })
      .eq("user_id", userId);

    results.push({
      table:   "incoming_plans (user_id)",
      deleted: c1 ?? null,
      error:   e1?.message ?? null,
    });

    const { error: e2, count: c2 } = await admin
      .from("incoming_plans")
      .delete({ count: "exact" })
      .eq("created_by", userId);

    results.push({
      table:   "incoming_plans (created_by)",
      deleted: c2 ?? null,
      error:   e2?.message ?? null,
    });
  }

  // ── 3. profiles（認証削除前に先に消す）──────────
  // 将来的に deleted_at を追加する場合はここを変更
  {
    const { error, count } = await admin
      .from("profiles")
      .delete({ count: "exact" })
      .eq("id", userId);

    results.push({
      table:   "profiles",
      deleted: count ?? null,
      error:   error?.message ?? null,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// DELETE /api/admin/users/[id]
// ─────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  if (!targetUserId) {
    return NextResponse.json({ error: "ユーザーIDが指定されていません" }, { status: 400 });
  }

  // ── Step 1: 通常クライアントで認証確認 ─────────
  const supabase = await createClient();
  const {
    data: { user: requestingUser },
  } = await supabase.auth.getUser();

  if (!requestingUser) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 自分自身の削除は禁止
  if (requestingUser.id === targetUserId) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません" },
      { status: 403 }
    );
  }

  // ── Step 2: 管理者 + 同一会社であることを確認 ──
  const { data: requestingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", requestingUser.id)
    .single();

  if (profileError || !requestingProfile) {
    return NextResponse.json({ error: "プロフィール情報が取得できません" }, { status: 403 });
  }

  if (requestingProfile.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  // 削除対象が同じ会社に属しているか確認
  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("company_id, full_name")
    .eq("id", targetUserId)
    .eq("company_id", requestingProfile.company_id)   // 同一会社のみ許可
    .single();

  if (targetProfileError || !targetProfile) {
    return NextResponse.json(
      { error: "削除対象のユーザーが見つかりません、または権限がありません" },
      { status: 403 }
    );
  }

  // ── Step 3: 管理者クライアント（RLSバイパス）を用意 ─
  const admin = createAdminClient();

  try {
    // ── Step 4: 関連データを先に削除 ───────────────
    const deleteResults = await deleteRelatedData(admin, targetUserId);

    // 関連データ削除のエラーをログに記録（処理は継続）
    for (const result of deleteResults) {
      if (result.error) {
        console.warn(
          `[admin/users/delete] 関連データ削除エラー table=${result.table} error=${result.error}`
        );
      } else {
        console.log(
          `[admin/users/delete] 削除完了 table=${result.table} count=${result.deleted ?? 0}`
        );
      }
    }

    // ── Step 5: Auth ユーザーを削除 ─────────────────
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);

    if (authDeleteError) {
      console.error(
        "[admin/users/delete] Auth削除エラー:",
        authDeleteError.message
      );
      return NextResponse.json(
        { error: "認証ユーザーの削除に失敗しました" },
        { status: 500 }
      );
    }

    // ── Step 6: user_operation_logs に記録 ──────────
    const now = new Date().toISOString();
    const { error: logError } = await admin
      .from("user_operation_logs")
      .insert({
        company_id:   requestingProfile.company_id,
        user_id:      targetUserId,
        action:       "permanent_delete",
        performed_by: requestingUser.id,
        performed_at: now,
        metadata: {
          snapshot_name:  targetProfile.full_name ?? null,
          deleted_via:    "api_immediate",
        },
      });
    if (logError) {
      console.warn("[admin/users/delete] log insert error:", logError.message);
    }

    // 監査ログ（コンソール）
    console.log(
      `[audit] USER_PERMANENT_DELETED` +
      ` | deletedBy=${requestingUser.id}` +
      ` | deletedAt=${now}` +
      ` | targetUserId=${targetUserId}` +
      ` | targetName=${targetProfile.full_name ?? "(名前なし)"}` +
      ` | companyId=${requestingProfile.company_id}`
    );

    return NextResponse.json(
      { success: true, message: "ユーザーを削除しました" },
      { status: 200 }
    );
  } catch (err) {
    // 予期せぬエラー：詳細はサーバーログのみ、クライアントには安全なメッセージのみ返す
    console.error("[admin/users/delete] 予期せぬエラー:", err);
    return NextResponse.json(
      { error: "ユーザーの削除中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
